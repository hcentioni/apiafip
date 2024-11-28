const padronA5Service = require('../services/padronA5Service');

const consultarPadronA5 = async (req, res) => {
    try {
        const { cuit } = req.params;

        if (!cuit) {
            return res.status(400).json({ error: 'CUIT no proporcionado' });
        }

        // Llamar al servicio de consulta al padrón A5
        const respuesta = await padronA5Service.consultarPadronA5(cuit);

        // Enviar la respuesta al cliente
        res.status(200).json(respuesta);
    } catch (error) {
        //console.error('Error en consultarPadronA5:', error);
        res.status(500).json({ error: 'Error al consultar el padrón A5' });
    }
};

module.exports = { consultarPadronA5 };
