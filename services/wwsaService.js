const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const soap = require('soap');
const xml2js = require('xml2js');
const { create } = require('xmlbuilder2');
require('dotenv').config();

// Variables de entorno
const {
    HOMOLOGACION_WSAA,
    PRODUCCION_WSAA,
    MODE,
    HOMOLOGACION_CERT_PATH,
    HOMOLOGACION_KEY_PATH,
    PRODUCCION_CERT_PATH,
    PRODUCCION_KEY_PATH,
} = process.env;

// Determinar URLs y certificados según el modo
const WSAA_URL = MODE === 'produccion' ? PRODUCCION_WSAA : HOMOLOGACION_WSAA;
const CERT_PATH = MODE === 'produccion' ? PRODUCCION_CERT_PATH : HOMOLOGACION_CERT_PATH;
const KEY_PATH = MODE === 'produccion' ? PRODUCCION_KEY_PATH : HOMOLOGACION_KEY_PATH;

// Directorios para TRA, CMS y Tokens
const TRA_CMS_DIR = path.join(__dirname, '..', 'tra_cms');
const TOKENS_DIR = path.join(__dirname, '..', 'tokens');

// Función auxiliar para verificar la existencia de un archivo
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

// Función auxiliar para leer un archivo JSON
function readJsonFile(filePath) {
    if (fileExists(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return null;
}

// Función auxiliar para escribir un archivo JSON
function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Genera el archivo TRA.xml para el servicio especificado
function generarTRA(service) {
    const now = new Date();
    const generationTime = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutos en el pasado
    const expirationTime = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 horas en el futuro

    const tra = create({ version: '1.0' })
        .ele('loginTicketRequest', { version: '1.0' })
        .ele('header')
        .ele('uniqueId').txt(Math.floor(now.getTime() / 1000)).up()
        .ele('generationTime').txt(generationTime.toISOString()).up() // Margen ajustado
        .ele('expirationTime').txt(expirationTime.toISOString()).up()
        .up()
        .ele('service').txt(service)
        .end({ prettyPrint: true });

    if (!fileExists(TRA_CMS_DIR)) {
        fs.mkdirSync(TRA_CMS_DIR, { recursive: true });
    }

    const traPath = path.join(TRA_CMS_DIR, `${service}_TRA.xml`);
    fs.writeFileSync(traPath, tra);

    return traPath;
}

// Firma el archivo TRA utilizando OpenSSL
function firmarTRA(traPath) {
    const cmsPath = traPath.replace('_TRA.xml', '_TRA.cms');
    const opensslCmd = `openssl smime -sign -in "${traPath}" -signer "${CERT_PATH}" -inkey "${KEY_PATH}" -outform DER -nodetach -out "${cmsPath}"`;

    try {
        execSync(opensslCmd, { stdio: 'inherit' });
        return cmsPath;
    } catch (error) {
        throw new Error(`Error al firmar el archivo TRA: ${error.message}`);
    }
}

// Verifica si el token aún es válido
function isTokenValid(tokenPath) {
    const tokenData = readJsonFile(tokenPath);

    if (tokenData && tokenData.expirationTime) {
        const expirationTime = new Date(tokenData.expirationTime);
        return expirationTime > new Date();
    }
    return false;
}

// Obtiene el token y sign desde WSAA
async function obtenerTokenYSign(service) {
    const tokenPath = path.join(TOKENS_DIR, `${service}_token.json`);

    // Si existe un token válido, retornarlo
    if (isTokenValid(tokenPath)) {
        console.log(`Token válido encontrado para el servicio ${service}.`);
        return readJsonFile(tokenPath);
    }

    console.log(`Token no encontrado o expirado para el servicio ${service}, generando uno nuevo...`);

    // Generar el archivo TRA.xml
    const traPath = path.join(TRA_CMS_DIR, `${service}_TRA.xml`);
    const cmsPath = path.join(TRA_CMS_DIR, `${service}_TRA.cms`);

    if (!fileExists(traPath)) {
        console.log(`Archivo TRA no encontrado para el servicio ${service}, generando uno nuevo...`);
        generarTRA(service);
    }

    if (!fileExists(cmsPath)) {
        console.log(`Archivo CMS no encontrado para el servicio ${service}, firmando uno nuevo...`);
        firmarTRA(traPath);
    }

    const cmsFirmado = fs.readFileSync(cmsPath, 'base64');

    // Crear cliente SOAP para la autenticación
    const client = await soap.createClientAsync(WSAA_URL);
    const [response] = await client.loginCmsAsync({ in0: cmsFirmado });

    const { loginTicketResponse } = await xml2js.parseStringPromise(response.loginCmsReturn);
    const token = loginTicketResponse.credentials[0].token[0];
    const sign = loginTicketResponse.credentials[0].sign[0];
    const expirationTime = loginTicketResponse.header[0].expirationTime[0];



    console.log(`Token recibido del WSAA para ${service}:`, loginTicketResponse.credentials[0].token[0]);


    
    // Guardar el token en el archivo
    writeJsonFile(tokenPath, { token, sign, expirationTime });


    return { token, sign };
}

module.exports = { obtenerTokenYSign };
