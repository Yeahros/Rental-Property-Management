const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

router.get('/stats', invoiceController.getInvoiceStats);
router.get('/', invoiceController.getInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.post('/', invoiceController.createInvoice);
router.put('/:id/status', invoiceController.updateInvoiceStatus);
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;

