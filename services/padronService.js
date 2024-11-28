const soap = require('soap');
const xml2js = require('xml2js');
require('dotenv').config();
const { obtenerTokenYSign } = require('./wwsaService');

const {
    MODE,
    HOMOLOGACION_PADRON,
    PRODUCCION_PADRON,
    CUIT_REPRESENTADA,
} = process.env;

const PADRON_URL = MODE === 'produccion' ? PRODUCCION_PADRON : HOMOLOGACION_PADRON;

/**
 * Consulta información del padrón AFIP para un CUIT específico.
 * @param {string} cuit - CUIT a consultar.
 * @returns {Promise<Object>} - Información obtenida del padrón.
 */
async function consultarPadron(cuit) {
    try {
        // Obtener token y sign para el servicio `ws_sr_padron_a13`
        const { token, sign } = await obtenerTokenYSign('ws_sr_padron_a13');


        // Crear cliente SOAP
        const client = await soap.createClientAsync(PADRON_URL);

        // Argumentos de la solicitud SOAP
        const args = {
            token,
            sign,
            idPersona: cuit,
            cuitRepresentada: CUIT_REPRESENTADA,
        };

        // Realizar la llamada al servicio SOAP
        const [result, rawResponse] = await client.getPersonaAsync(args);

        // Procesar y devolver la respuesta
        const parsedResponse = await xml2js.parseStringPromise(rawResponse);
        console.log('Respuesta del padrón:', parsedResponse);
        return parsedResponse;
    } catch (error) {
        if (error.root && error.root.Envelope && error.root.Envelope.Body.Fault) {
            const fault = error.root.Envelope.Body.Fault;
            console.error('Error al consultar el padrón:', fault.faultstring);
            throw new Error(fault.faultstring || 'Error desconocido al consultar el padrón.');
        }
        console.error('Error inesperado al consultar el padrón:', error.message);
        throw new Error('No se pudo consultar el padrón.');
    }
}

module.exports = { consultarPadron };
