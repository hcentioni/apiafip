const express = require('express');
const padronController = require('../controllers/padronController');
const facturaController = require('../controllers/facturaController');
const padronA5Controller = require('../controllers/padronA5Controller');

const router = express.Router();

// Rutas de consulta al padrón
router.get('/padron/:cuit', padronController.consultarPadron);

// Rutas de autorización de facturas
router.post('/factura', facturaController.autorizarFacturaController);

// Rutas de consulta a constancia
router.get('/constancia/:cuit', padronA5Controller.consultarPadronA5);

module.exports = router;
