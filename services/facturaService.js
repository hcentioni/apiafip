const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const moment = require('moment');
const { parseStringPromise } = xml2js;
const { obtenerTokenYSign } = require('./wwsaService');
const WSFEV1_URL = process.env.WSFEV1_URL;


const TOKEN_PATH = path.resolve(__dirname, '../tokens/wsfe_token.json');


/**
 * Construye el XML para la solicitud SOAP al servicio WSFEV1.
 */
function construirSoapRequest(token, sign, FeCabReq, FeDetReq) {

    const builder = new xml2js.Builder({ headless: true });
    const soapObject = {
        'soapenv:Envelope': {
            $: {
                'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
                'xmlns:ar': 'http://ar.gov.afip.dif.FEV1/',
            },
            'soapenv:Header': {},
            'soapenv:Body': {
                'ar:FECAESolicitar': {
                    'ar:Auth': {
                        'ar:Token': token,
                        'ar:Sign': sign,
                        'ar:Cuit': FeCabReq.CuitRepresentada,
                    },
                    'ar:FeCAEReq': {
                        'ar:FeCabReq': {
                            'ar:CantReg': FeCabReq.CantReg,
                            'ar:PtoVta': FeCabReq.PtoVta,
                            'ar:CbteTipo': FeCabReq.CbteTipo,
                        },
                        'ar:FeDetReq': {
                            'ar:FECAEDetRequest': {
                                'ar:Concepto': FeDetReq.Concepto,
                                'ar:DocTipo': FeDetReq.DocTipo,
                                'ar:DocNro': FeDetReq.DocNro,
                                'ar:CbteDesde': FeDetReq.CbteDesde,
                                'ar:CbteHasta': FeDetReq.CbteHasta,
                                'ar:FchVtoPago': FeDetReq.FchVtoPago,
                                'ar:CbteFch': FeDetReq.CbteFch,
                                'ar:ImpTotal': FeDetReq.ImpTotal,
                                'ar:ImpTotConc': FeDetReq.ImpTotConc,
                                'ar:ImpNeto': FeDetReq.ImpNeto,
                                'ar:ImpOpEx': FeDetReq.ImpOpEx,
                                'ar:ImpTrib': FeDetReq.ImpTrib,
                                'ar:ImpIVA': FeDetReq.ImpIVA,
                                'ar:MonId': FeDetReq.MonId,
                                'ar:MonCotiz': FeDetReq.MonCotiz,
                                'ar:Iva': {
                                    'ar:AlicIva': FeDetReq.Iva.map(iva => ({
                                        'ar:Id': iva.Id,
                                        'ar:BaseImp': iva.BaseImp,
                                        'ar:Importe': iva.Importe,
                                    })),
                                },
                                // Agregar CbtesAsoc si está definido
                                ...(FeDetReq.CbtesAsoc && FeDetReq.CbtesAsoc.length > 0 && {
                                    'ar:CbtesAsoc': {
                                        'ar:CbteAsoc': FeDetReq.CbtesAsoc.map(cbte => ({
                                            'ar:Tipo': cbte.Tipo,
                                            'ar:PtoVta': cbte.PtoVta,
                                            'ar:Nro': cbte.Nro,
                                            //'ar:Cuit': cbte.Cuit,
                                            'ar:CbteFch': cbte.CbteFch,
                                        })),
                                    },
                                }),
                                


                        // Agregar Los Opcionales
                        ...(FeDetReq.Opcionales && FeDetReq.Opcionales.length > 0 && {
                            'ar:Opcionales': {
                                'ar:Opcional': FeDetReq.Opcionales.map(opc => ({
                                    'ar:Id': opc.Id,
                                    'ar:Valor': opc.Valor
                                })),
                            },
                        }),






                            },
                        },
                    },
                },
            },
        },
    };
    return builder.buildObject(soapObject);
}

/**
 * Procesa la respuesta SOAP y organiza los datos según éxito o error.
 */
function procesarRespuesta(responseXml) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(responseXml, { explicitArray: false }, (err, result) => {
            if (err) {
                return reject('Error al analizar la respuesta XML: ' + err.message);
            }

            try {
                // Acceso a la respuesta principal
                const feResponse = result['soap:Envelope']['soap:Body']['FECAESolicitarResponse']['FECAESolicitarResult'];

                // Verificar si hay errores generales en la respuesta
                if (feResponse.Errors && feResponse.Errors.Err) {
                    const errores = Array.isArray(feResponse.Errors.Err)
                        ? feResponse.Errors.Err
                        : [feResponse.Errors.Err];

                    return resolve({
                        success: false,
                        response: {
                            cuit: null,
                            puntoVenta: null,
                            tipoComprobante: null,
                            fechaProceso: null,
                            resultado: null,
                            reproceso: null,
                            cae: null,
                            caeFchVto: null,
                            detalle: null,
                            observaciones: [],
                            errors: errores.map(error => ({
                                code: error.Code,
                                message: error.Msg,
                            })),
                            events: [],
                        },
                    });
                }

                // Procesar la cabecera de respuesta
                const feCabResp = feResponse.FeCabResp;
                const respuesta = {
                    cuit: feCabResp.Cuit || null,
                    puntoVenta: feCabResp.PtoVta || null,
                    tipoComprobante: feCabResp.CbteTipo || null,
                    fechaProceso: feCabResp.FchProceso || null,
                    resultado: feCabResp.Resultado || null,
                    reproceso: feCabResp.Reproceso || 'N',
                    cae: null,
                    caeFchVto: null,
                    detalle: null,
                    errors: [],
                    observaciones: [],
                    events: [],
                };

                // Caso exitoso (Resultado === 'A')
                if (feCabResp.Resultado === 'A') {
                    const detalle = feResponse.FeDetResp.FECAEDetResponse;
                    respuesta.cae = detalle.CAE;
                    respuesta.caeFchVto = detalle.CAEFchVto;

                    // Agregar detalle completo
                    respuesta.detalle = {
                        concepto: detalle.Concepto,
                        docTipo: detalle.DocTipo,
                        docNro: detalle.DocNro,
                        cbteDesde: detalle.CbteDesde,
                        cbteHasta: detalle.CbteHasta,
                        cbteFch: detalle.CbteFch,
                        resultado: detalle.Resultado,
                    };
                } 
                // Caso rechazado (Resultado === 'R') o con observaciones
                else if (feCabResp.Resultado === 'R') {
                    const detalle = feResponse.FeDetResp.FECAEDetResponse;

                    // Agregar detalle completo
                    respuesta.detalle = {
                        concepto: detalle.Concepto,
                        docTipo: detalle.DocTipo,
                        docNro: detalle.DocNro,
                        cbteDesde: detalle.CbteDesde,
                        cbteHasta: detalle.CbteHasta,
                        cbteFch: detalle.CbteFch,
                        resultado: detalle.Resultado,
                    };

                    // Procesar observaciones si existen
                    if (detalle.Observaciones && detalle.Observaciones.Obs) {
                        const observaciones = Array.isArray(detalle.Observaciones.Obs)
                            ? detalle.Observaciones.Obs
                            : [detalle.Observaciones.Obs];

                        respuesta.observaciones = observaciones.map(obs => ({
                            code: obs.Code,
                            message: obs.Msg,
                        }));
                    }
                }

                // Procesar eventos si existen
                if (feResponse.Events && feResponse.Events.Evt) {
                    const eventos = Array.isArray(feResponse.Events.Evt)
                        ? feResponse.Events.Evt
                        : [feResponse.Events.Evt];

                    respuesta.events = eventos.map(evento => ({
                        code: evento.Code,
                        message: evento.Msg,
                    }));
                }

                resolve({
                    success: feCabResp.Resultado === 'A',
                    response: respuesta,
                });
            } catch (e) {
                reject('Error al procesar la estructura de respuesta: ' + e.message);
            }
        });
    });
}



/**
 * Autoriza una factura con AFIP mediante WSFEV1.
 */
async function autorizarFactura(FeCabReq, FeDetReq) {
    try {
       
       // const { token, sign } = obtenerTokenYSign();
       const { token, sign } = await obtenerTokenYSign('wsfe');

        const ultimoComprobante = await obtenerUltimoComprobanteAutorizado(FeCabReq.PtoVta, FeCabReq.CbteTipo,FeCabReq.CuitRepresentada)

        FeDetReq[0].CbteDesde = ultimoComprobante + 1;
        FeDetReq[0].CbteHasta = ultimoComprobante + 1;

        const soapRequest = construirSoapRequest(token, sign, FeCabReq, FeDetReq[0]);

        console.log(soapRequest)
        const response = await axios.post(WSFEV1_URL, soapRequest, {
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
            },
        });

       

        return await procesarRespuesta(response.data);

    } catch (error) {

        console.error('Error al autorizar la factura>', error.message);
        throw new Error( error.message);
    }
}
/**
 * Obtiene el último número de comprobante autorizado para un punto de venta y tipo de comprobante.
 * @param {number} puntoVenta - Punto de venta.
 * @param {number} tipoComprobante - Tipo de comprobante.
 * @returns {Promise<number>} Último número de comprobante autorizado.
 */
async function obtenerUltimoComprobanteAutorizado(puntoVenta, tipoComprobante, CuitRepresentada) {
    try {
        // Leer el token y sign del archivo JSON
        const tokenPath = path.resolve(__dirname, '../tokens/wsfe_token.json');
        if (!fs.existsSync(tokenPath)) {
            throw new Error('El archivo de token no existe.');
        }

        const { token, sign } = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));

        if (!token || !sign) {
            throw new Error('El archivo de token no contiene los datos necesarios.');
        }

        // Construir el XML para FECompUltimoAutorizado
        const builder = new xml2js.Builder({ headless: true });
        const soapRequest = builder.buildObject({
            'soapenv:Envelope': {
                $: {
                    'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
                    'xmlns:ar': 'http://ar.gov.afip.dif.FEV1/',
                },
                'soapenv:Header': {},
                'soapenv:Body': {
                    'ar:FECompUltimoAutorizado': {
                        'ar:Auth': {
                            'ar:Token': token,
                            'ar:Sign': sign,
                            'ar:Cuit': CuitRepresentada,
                        },
                        'ar:PtoVta': puntoVenta,
                        'ar:CbteTipo': tipoComprobante,
                    },
                },
            },
        });

        const response = await axios.post(WSFEV1_URL, soapRequest, {
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
            },
        });

        // Procesar la respuesta
        const parsedResponse = await parseStringPromise(response.data, { explicitArray: false });
        const result =
            parsedResponse['soap:Envelope']['soap:Body']['FECompUltimoAutorizadoResponse'][
            'FECompUltimoAutorizadoResult'
            ];

        if (!result) {
            throw new Error('Respuesta inválida del servicio FECompUltimoAutorizado.');
        }

        return parseInt(result.CbteNro);
    } catch (error) {
        console.error('Error al obtener el último comprobante autorizado:', error.message);
        throw new Error('No se pudo obtener el último comprobante autorizado.');
    }
}


module.exports = {
    autorizarFactura,
    obtenerUltimoComprobanteAutorizado,
};