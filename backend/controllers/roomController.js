const pool = require('../config/database');

// Lấy danh sách Phòng
const getRooms = async (req, res) => {
    const houseId = req.query.house_id;
    let sql = `
        SELECT r.*, 
               t.full_name as tenant_name, 
               c.end_date as contract_end_date 
        FROM rooms r
        LEFT JOIN contracts c ON r.room_id = c.room_id AND c.is_current = 1
        LEFT JOIN tenants t ON c.tenant_id = t.tenant_id
    `;

    let params = [];
    if (houseId) {
        sql += ` WHERE r.house_id = ?`;
        params.push(houseId);
    }

    try {
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
};

// Lấy chi tiết một phòng theo ID
const getRoomById = async (req, res) => {
    try {
        const roomId = req.params.id;
        
        // Lấy thông tin phòng kèm thông tin khách thuê và hợp đồng
        const [rooms] = await pool.query(`
            SELECT r.*, 
                   t.full_name as tenant_name,
                   t.phone as tenant_phone,
                   t.email as tenant_email,
                   c.contract_id as current_contract_id,
                   c.start_date as contract_start_date,
                   c.end_date as contract_end_date
            FROM rooms r
            LEFT JOIN contracts c ON r.room_id = c.room_id AND c.is_current = 1
            LEFT JOIN tenants t ON c.tenant_id = t.tenant_id
            WHERE r.room_id = ?
        `, [roomId]);
        
        if (rooms.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }
        
        const room = rooms[0];
        
        // Lấy dịch vụ của phòng
        const [services] = await pool.query(`
            SELECT s.service_name as name, s.service_type as type, rs.price
            FROM room_services rs
            JOIN services s ON rs.service_id = s.service_id
            WHERE rs.room_id = ?
        `, [roomId]);
        
        room.services = services || [];

        // Lấy thành viên phòng nếu có hợp đồng hiện tại
        if (room.current_contract_id) {
            const [members] = await pool.query(
                `SELECT member_id, full_name, phone, id_card_number, cccd_front, cccd_back, created_at
                 FROM room_members
                 WHERE contract_id = ?`,
                [room.current_contract_id]
            );
            room.members = members || [];
        } else {
            room.members = [];
        }
        
        res.json(room);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết phòng', error: err.message });
    }
};

// Cập nhật Phòng
const updateRoom = async (req, res) => {
    const roomId = req.params.id;
    const { room_number, floor, area, rent, facilities, services } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Cập nhật thông tin phòng
        await connection.query(`
            UPDATE rooms 
            SET room_number = ?, floor = ?, area_m2 = ?, base_rent = ?, facilities = ?
            WHERE room_id = ?
        `, [room_number, floor || null, area || null, rent, facilities || null, roomId]);

        // 2. Xóa tất cả dịch vụ cũ của phòng
        await connection.query('DELETE FROM room_services WHERE room_id = ?', [roomId]);

        // 3. Thêm lại dịch vụ mới nếu có
        if (services && Array.isArray(services) && services.length > 0) {
            // Lấy danh sách service_id từ tên dịch vụ
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

                    // Thêm vào room_services
                    await connection.query(
                        'INSERT INTO room_services (room_id, service_id, price) VALUES (?, ?, ?)',
                        [roomId, serviceId, svc.price]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ message: 'Cập nhật phòng thành công' });
    } catch (err) {
        await connection.rollback();
        console.error('Update Room Error:', err);
        res.status(500).json({ message: 'Lỗi khi cập nhật phòng', error: err.message });
    } finally {
        connection.release();
    }
};

// Tạo Phòng mới
const createRoom = async (req, res) => {
    const { house_id, room_number, floor, area, rent, facilities, services } = req.body;

    if (!house_id) return res.status(400).json({ message: "Cần chọn nhà trọ" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Tạo phòng mới
        const sql = `INSERT INTO rooms (house_id, room_number, floor, area_m2, base_rent, facilities, status) 
                     VALUES (?, ?, ?, ?, ?, ?, 'Vacant')`;

        const [result] = await connection.query(sql, [house_id, room_number, floor, area, rent, facilities]);
        const roomId = result.insertId;

        // 2. Thêm dịch vụ cho phòng nếu có
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

                    // Thêm vào room_services
                    await connection.query(
                        'INSERT INTO room_services (room_id, service_id, price) VALUES (?, ?, ?)',
                        [roomId, serviceId, svc.price]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ message: 'Tạo phòng thành công', id: roomId });
    } catch (err) {
        await connection.rollback();
        console.error('Create Room Error:', err);
        res.status(500).json({ message: 'Lỗi khi tạo phòng', error: err.message });
    } finally {
        connection.release();
    }
};

// Xóa Phòng
const deleteRoom = async (req, res) => {
    const roomId = req.params.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Kiểm tra xem phòng có đang được thuê không
        const [contracts] = await connection.query(
            'SELECT * FROM contracts WHERE room_id = ? AND status = "Active"',
            [roomId]
        );

        if (contracts.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'Không thể xóa phòng đang được thuê' });
        }

        // Kiểm tra trạng thái phòng
        const [rooms] = await connection.query(
            'SELECT status FROM rooms WHERE room_id = ?',
            [roomId]
        );

        if (rooms.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }

        if (rooms[0].status !== 'Vacant') {
            await connection.rollback();
            return res.status(400).json({ message: 'Chỉ có thể xóa phòng trống' });
        }

        // Xóa dịch vụ của phòng
        await connection.query('DELETE FROM room_services WHERE room_id = ?', [roomId]);

        // Xóa phòng
        await connection.query('DELETE FROM rooms WHERE room_id = ?', [roomId]);

        await connection.commit();
        res.json({ message: 'Xóa phòng thành công' });
    } catch (err) {
        await connection.rollback();
        console.error('Delete Room Error:', err);
        res.status(500).json({ message: 'Lỗi khi xóa phòng', error: err.message });
    } finally {
        connection.release();
    }
};

module.exports = {
    getRooms,
    getRoomById,
    createRoom,
    updateRoom,
    deleteRoom
};

