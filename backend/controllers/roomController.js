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
        
        res.json(room);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết phòng', error: err.message });
    }
};

// Tạo Phòng mới
const createRoom = async (req, res) => {
    const { house_id, room_number, floor, area, rent, facilities } = req.body;

    if (!house_id) return res.status(400).json({ message: "Cần chọn nhà trọ" });

    try {
        const sql = `INSERT INTO rooms (house_id, room_number, floor, area_m2, base_rent, facilities, status) 
                     VALUES (?, ?, ?, ?, ?, ?, 'Vacant')`;

        const [result] = await pool.execute(sql, [house_id, room_number, floor, area, rent, facilities]);

        await pool.execute(`UPDATE boarding_houses SET total_rooms = total_rooms + 1 WHERE house_id = ?`, [house_id]);

        res.json({ message: 'Tạo phòng thành công', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi tạo phòng: ' + err.message);
    }
};

module.exports = {
    getRooms,
    getRoomById,
    createRoom
};

