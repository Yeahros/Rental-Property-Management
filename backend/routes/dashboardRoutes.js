const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', dashboardController.getDashboardStats);
router.get('/chart', dashboardController.getDashboardChart);
router.get('/upcoming-payments', dashboardController.getUpcomingPayments);
router.get('/activities', dashboardController.getDashboardActivities);
router.get('/top-properties', dashboardController.getTopProperties);
router.get('/usage', dashboardController.getUsageChart);

module.exports = router;

