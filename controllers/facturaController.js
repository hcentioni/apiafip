const { autorizarFactura } = require('../services/facturaService');

const autorizarFacturaController = async (req, res) => {
    console.log('Autorizanzo Comprobante!!!')
    const { FeCabReq, FeDetReq } = req.body;

    if (!FeCabReq || !FeDetReq || !FeDetReq.length) {
        return res.status(400).json({ error: 'Datos incompletos para autorizar la factura.' });
    }

    try {
        const response = await autorizarFactura(FeCabReq, FeDetReq);
        console.log('Comprobante Autorizado', response)
        res.json({ success: true, response });
    } catch (error) {
        console.error('Error en autorizarFacturaController:', error.message);
        res.status(500).json({ error: 'No se pudo autorizar la factura.'});
    }
};

module.exports = { autorizarFacturaController };
