require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Static files
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api', require('./routes/authRoutes'));
app.use('/api/houses', require('./routes/houseRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/contracts', require('./routes/contractRoutes'));
app.use('/api/invoices', require('./routes/invoiceRoutes'));
app.use('/api/maintenance', require('./routes/maintenanceRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/tenant/dashboard', require('./routes/tenantDashboardRoutes'));
app.use('/api/tenant/invoices', require('./routes/tenantInvoiceRoutes'));
app.use('/api/tenant/maintenance', require('./routes/tenantMaintenanceRoutes'));

// Khởi chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
