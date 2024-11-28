const padronService = require('../services/padronService');

const consultarPadron = async (req, res) => {
    try {
        const { cuit } = req.params;

        if (!cuit) {
            return res.status(400).json({ error: 'CUIT no proporcionado' });
        }

        const respuesta = await padronService.consultarPadron(cuit);

        res.status(200).json(respuesta);
    } catch (error) {
        //console.error('Error en consultarPadron:', error);
        res.status(500).json({ error: 'Error al consultar el padrón' });
    }
};

module.exports = { consultarPadron };
