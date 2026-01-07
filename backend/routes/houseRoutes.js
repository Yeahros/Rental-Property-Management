const express = require('express');
const router = express.Router();
const houseController = require('../controllers/houseController');

router.get('/stats', houseController.getStats);
router.get('/', houseController.getHouses);
router.get('/:id/revenue', houseController.getHouseRevenue); // Route cụ thể phải đặt trước route động
router.get('/:id', houseController.getHouseById);
router.post('/', houseController.createHouse);
router.put('/:id', houseController.updateHouse);

module.exports = router;

