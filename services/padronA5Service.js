const soap = require('soap');
const xml2js = require('xml2js');
require('dotenv').config();
const { obtenerTokenYSign } = require('./wwsaService');

const {
    MODE,
    HOMOLOGACION_PADRON_A5,
    PRODUCCION_PADRON_A5,
    CUIT_REPRESENTADA,
} = process.env;

// Determinar la URL del servicio según el modo
const PADRON_A5_URL = MODE === 'produccion' ? PRODUCCION_PADRON_A5 : HOMOLOGACION_PADRON_A5;

/**
 * Consulta información del padrón A5 de AFIP para un CUIT específico.
 * @param {string} cuit - CUIT a consultar.
 * @returns {Promise<Object>} - Información obtenida del padrón A5.
 */
async function consultarPadronA5(cuit) {
    try {
        // Validar la URL del servicio
        if (!PADRON_A5_URL) {
            throw new Error('La URL del servicio PADRÓN A5 no está definida.');
        }

        console.log('URL del servicio PADRÓN A5:', PADRON_A5_URL);

        // Obtener token y sign para el servicio `ws_sr_padron_a5`
        const { token, sign } = await obtenerTokenYSign('ws_sr_padron_a5');

        // Crear cliente SOAP
        const client = await soap.createClientAsync(PADRON_A5_URL);

        // Argumentos de la solicitud SOAP
        const args = {
            token,
            sign,
            cuitRepresentada: CUIT_REPRESENTADA,
            idPersona: cuit,
        };

        // Realizar la llamada al servicio SOAP
        const [result, rawResponse] = await client.getPersonaAsync(args);

        // Procesar y devolver la respuesta
        const parsedResponse = await xml2js.parseStringPromise(rawResponse);

        // Mostrar el contenido de `soap:Body`
        //console.log('Respuesta del padrón A5:', parsedResponse);


        return parsedResponse;
    } catch (error) {
        console.error('Error inesperado al consultar el padrón A5:', error.message);
        throw new Error('No se pudo consultar el padrón A5.');
    }
}


module.exports = { consultarPadronA5 };
