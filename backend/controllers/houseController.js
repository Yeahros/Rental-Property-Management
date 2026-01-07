const pool = require('../config/database');

// Lấy thống kê
const getStats = async (req, res) => {
    try {
        const [rooms] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
                SUM(CASE WHEN status = 'Vacant' THEN 1 ELSE 0 END) as vacant
            FROM rooms
        `);

        const [revenue] = await pool.query(`
            SELECT COALESCE(SUM(total_amount), 0) as total_revenue
            FROM invoices 
            WHERE status = 'Paid' 
            AND MONTH(issue_date) = MONTH(CURRENT_DATE()) 
            AND YEAR(issue_date) = YEAR(CURRENT_DATE())
        `);

        res.json({
            total_rooms: rooms[0].total,
            occupied: rooms[0].occupied,
            vacant: rooms[0].vacant,
            revenue: revenue[0].total_revenue
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi Server khi lấy thống kê');
    }
};

// Lấy danh sách Nhà trọ
const getHouses = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM boarding_houses');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
};

// Lấy chi tiết một nhà trọ theo ID
const getHouseById = async (req, res) => {
    try {
        const houseId = req.params.id;
        
        // Lấy thông tin nhà trọ
        const [houses] = await pool.query(
            'SELECT * FROM boarding_houses WHERE house_id = ?',
            [houseId]
        );
        
        if (houses.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy nhà trọ' });
        }
        
        const house = houses[0];
        
        // Lấy dịch vụ của nhà trọ
        const [services] = await pool.query(`
            SELECT s.service_name as name, s.service_type as type, hs.price
            FROM house_services hs
            JOIN services s ON hs.service_id = s.service_id
            WHERE hs.house_id = ?
        `, [houseId]);
        
        house.services = services || [];
        
        res.json(house);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết nhà trọ', error: err.message });
    }
};

// Lấy doanh thu tháng của một nhà trọ
const getHouseRevenue = async (req, res) => {
    try {
        const houseId = req.params.id;

        const [revenue] = await pool.query(`
            SELECT COALESCE(SUM(base_rent), 0) as monthly_revenue
            FROM rooms
            WHERE house_id = ?
        `, [houseId]);

        res.json({ monthly_revenue: revenue[0].monthly_revenue || 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi lấy doanh thu', error: err.message });
    }
};

// Tạo Nhà trọ mới
const createHouse = async (req, res) => {
    const { name, address, description, landlord_id, services } = req.body;
    const ownerId = landlord_id || 1;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Tạo nhà trọ mới
        const sql = 'INSERT INTO boarding_houses (landlord_id, house_name, address, description, total_rooms) VALUES (?, ?, ?, ?, 0)';
        const [result] = await connection.query(sql, [ownerId, name, address, description]);
        const houseId = result.insertId;

        // 2. Thêm dịch vụ cho nhà trọ nếu có
        if (services && Array.isArray(services) && services.length > 0) {
            for (const svc of services) {
                if (svc.name && svc.price) {
                    // Tìm hoặc tạo service
                    let [serviceRows] = await connection.query(
                        'SELECT service_id FROM services WHERE service_name = ? AND service_type = ?',
                        [svc.name, svc.type || 'Theo số (kWh/khối)']
                    );

                    let serviceId;
                    if (serviceRows.length === 0) {
                        // Tạo service mới nếu chưa có
                        const [insertResult] = await connection.query(
                            'INSERT INTO services (service_name, service_type) VALUES (?, ?)',
                            [svc.name, svc.type || 'Theo số (kWh/khối)']
                        );
                        serviceId = insertResult.insertId;
                    } else {
                        serviceId = serviceRows[0].service_id;
                    }

                    // Thêm vào house_services
                    await connection.query(
                        'INSERT INTO house_services (house_id, service_id, price) VALUES (?, ?, ?)',
                        [houseId, serviceId, svc.price]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ message: 'Tạo nhà thành công', id: houseId });
    } catch (err) {
        await connection.rollback();
        console.error('Create House Error:', err);
        res.status(500).json({ message: 'Lỗi khi tạo nhà', error: err.message });
    } finally {
        connection.release();
    }
};

// Cập nhật Nhà trọ
const updateHouse = async (req, res) => {
    const houseId = req.params.id;
    const { name, address, description, services } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Cập nhật thông tin nhà trọ
        await connection.query(`
            UPDATE boarding_houses 
            SET house_name = ?, address = ?, description = ?
            WHERE house_id = ?
        `, [name, address || null, description || null, houseId]);

        // 2. Xóa tất cả dịch vụ cũ của nhà trọ
        await connection.query('DELETE FROM house_services WHERE house_id = ?', [houseId]);

        // 3. Thêm lại dịch vụ mới nếu có
        if (services && Array.isArray(services) && services.length > 0) {
            for (const svc of services) {
                if (svc.name && svc.price) {
                    // Tìm hoặc tạo service
                    let [serviceRows] = await connection.query(
                        'SELECT service_id FROM services WHERE service_name = ? AND service_type = ?',
                        [svc.name, svc.type || 'Theo số (kWh/khối)']
                    );

                    let serviceId;
                    if (serviceRows.length === 0) {
                        // Tạo service mới nếu chưa có
                        const [insertResult] = await connection.query(
                            'INSERT INTO services (service_name, service_type) VALUES (?, ?)',
                            [svc.name, svc.type || 'Theo số (kWh/khối)']
                        );
                        serviceId = insertResult.insertId;
                    } else {
                        serviceId = serviceRows[0].service_id;
                    }

                    // Thêm vào house_services
                    await connection.query(
                        'INSERT INTO house_services (house_id, service_id, price) VALUES (?, ?, ?)',
                        [houseId, serviceId, svc.price]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ message: 'Cập nhật nhà trọ thành công' });
    } catch (err) {
        await connection.rollback();
        console.error('Update House Error:', err);
        res.status(500).json({ message: 'Lỗi khi cập nhật nhà trọ', error: err.message });
    } finally {
        connection.release();
    }
};

module.exports = {
    getStats,
    getHouses,
    getHouseById,
    getHouseRevenue,
    createHouse,
    updateHouse
};

