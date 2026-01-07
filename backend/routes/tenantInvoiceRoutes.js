const express = require('express');
const router = express.Router();
const tenantInvoiceController = require('../controllers/tenantInvoiceController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, tenantInvoiceController.getInvoices);
router.get('/:id', authenticateToken, tenantInvoiceController.getInvoiceById);

module.exports = router;

