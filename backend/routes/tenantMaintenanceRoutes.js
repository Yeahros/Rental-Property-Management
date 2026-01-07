const express = require('express');
const router = express.Router();
const tenantMaintenanceController = require('../controllers/tenantMaintenanceController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, tenantMaintenanceController.getRequests);
router.post('/', authenticateToken, tenantMaintenanceController.createRequest);
router.put('/:id/cancel', authenticateToken, tenantMaintenanceController.cancelRequest);

module.exports = router;


