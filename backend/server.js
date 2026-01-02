require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();


const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // Lưu vào thư mục uploads
    },
    filename: function (req, file, cb) {
        // Đặt tên file: fieldname-timestamp.duoi_file (để tránh trùng tên)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Cấu hình để Frontend có thể truy cập file trong thư mục uploads qua đường dẫn http://localhost:3000/uploads/...
app.use('/uploads', express.static('uploads'));
// Middleware
app.use(cors()); // Cho phép frontend gọi API
app.use(bodyParser.json());

// Kết nối Database
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});



// ==========================================
// PHẦN 1: API XÁC THỰC (AUTH)
// ==========================================

// 1. Đăng ký Chủ trọ
app.post('/api/register/landlord', async (req, res) => {
    const { full_name, phone, email, password, address } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM landlords WHERE phone = ?', [phone]);
        if (rows.length > 0) {
            return res.status(400).json({ message: 'Số điện thoại đã được đăng ký' });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const [result] = await pool.execute(
            'INSERT INTO landlords (full_name, phone, email, password_hash, address) VALUES (?, ?, ?, ?, ?)',
            [full_name, phone, email, password_hash, address || null]
        );

        res.status(201).json({ message: 'Đăng ký thành công', landlordId: result.insertId });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// 2. Đăng nhập Chủ trọ
app.post('/api/login/landlord', async (req, res) => {
    const { email, password } = req.body; 

    try {
        const [rows] = await pool.execute(
            'SELECT * FROM landlords WHERE email = ? OR phone = ?', 
            [email, email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Tài khoản không tồn tại' });
        }

        const landlord = rows[0];
        const isMatch = await bcrypt.compare(password, landlord.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Sai mật khẩu' });
        }

        const token = jwt.sign(
            { id: landlord.landlord_id, role: 'landlord' },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ 
            message: 'Đăng nhập thành công',
            token,
            user: { name: landlord.full_name, role: 'landlord' }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// 3. Đăng nhập Khách thuê
app.post('/api/login/tenant', async (req, res) => {
    const { email, password } = req.body; 

    try {
        // Tìm user_account theo username (số điện thoại)
        const [accountRows] = await pool.execute(
            `SELECT ua.*, t.tenant_id, t.full_name 
             FROM user_accounts ua
             JOIN tenants t ON ua.tenant_id = t.tenant_id
             WHERE ua.username = ?`,
            [email]
        );

        if (accountRows.length === 0) {
            return res.status(401).json({ message: 'Số điện thoại khách thuê không tồn tại' });
        }

        const account = accountRows[0];

        // Kiểm tra mật khẩu (plain text, không hash)
        if (password !== account.password_hash) {
            return res.status(401).json({ message: 'Sai mật khẩu' });
        }

        // Kiểm tra trạng thái hợp đồng - nếu hợp đồng đã chấm dứt thì không cho đăng nhập
        const [contractRows] = await pool.execute(
            `SELECT status FROM contracts 
             WHERE tenant_id = ? AND is_current = 1 
             ORDER BY created_at DESC LIMIT 1`,
            [account.tenant_id]
        );

        if (contractRows.length > 0 && contractRows[0].status === 'Terminated') {
            return res.status(403).json({ 
                message: 'Tài khoản đã bị khóa do hợp đồng đã chấm dứt' 
            });
        }

        // Kiểm tra is_active
        if (!account.is_active) {
            return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
        }

        // Kiểm tra nếu không có hợp đồng active thì cũng không cho đăng nhập
        if (contractRows.length === 0) {
            return res.status(403).json({ 
                message: 'Tài khoản chưa có hợp đồng hợp lệ' 
            });
        }

        const token = jwt.sign(
            { id: account.tenant_id, role: 'tenant' },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ 
            message: 'Đăng nhập thành công',
            token,
            user: { name: account.full_name, role: 'tenant' }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==========================================
// PHẦN 2: API QUẢN LÝ BẤT ĐỘNG SẢN (MỚI THÊM)
// ==========================================

// 4. Lấy thống kê (Stats)
app.get('/api/stats', async (req, res) => {
    try {
        // Query đếm số phòng và trạng thái
        const [rooms] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
                SUM(CASE WHEN status = 'Vacant' THEN 1 ELSE 0 END) as vacant
            FROM rooms
        `);

        // Query tính doanh thu tháng hiện tại (từ các hóa đơn đã thanh toán)
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
});

// 5. Lấy danh sách Nhà trọ
app.get('/api/houses', async (req, res) => {
    try {
        // Thực tế sau này sẽ cần WHERE landlord_id = ? lấy từ Token
        const [rows] = await pool.query('SELECT * FROM boarding_houses');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
});

// 6. Tạo Nhà trọ mới
app.post('/api/houses', async (req, res) => {
    const { name, address, description, landlord_id } = req.body;
    // Tạm thời lấy landlord_id từ body gửi lên (demo), sau này lấy từ Token
    const ownerId = landlord_id || 1; 

    try {
        const sql = 'INSERT INTO boarding_houses (landlord_id, house_name, address, description, total_rooms) VALUES (?, ?, ?, ?, 0)';
        const [result] = await pool.execute(sql, [ownerId, name, address, description]);
        res.json({ message: 'Tạo nhà thành công', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi tạo nhà');
    }
});

// 7. Lấy danh sách Phòng (kèm thông tin người thuê nếu có)
app.get('/api/rooms', async (req, res) => {
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
});

// 8. Tạo Phòng mới
app.post('/api/rooms', async (req, res) => {
    const { house_id, room_number, floor, area, rent, facilities } = req.body;

    if (!house_id) return res.status(400).json({message: "Cần chọn nhà trọ"});

    try {
        const sql = `INSERT INTO rooms (house_id, room_number, floor, area_m2, base_rent, facilities, status) 
                     VALUES (?, ?, ?, ?, ?, ?, 'Vacant')`;
        
        const [result] = await pool.execute(sql, [house_id, room_number, floor, area, rent, facilities]);
        
        // Cập nhật số lượng phòng cho nhà
        await pool.execute(`UPDATE boarding_houses SET total_rooms = total_rooms + 1 WHERE house_id = ?`, [house_id]);

        res.json({ message: 'Tạo phòng thành công', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi tạo phòng: ' + err.message);
    }
});

// --- API QUẢN LÝ HỢP ĐỒNG & KHÁCH THUÊ ---

// 1. Lấy danh sách Hợp đồng (Kèm thông tin Khách và Phòng)
app.get('/api/contracts', async (req, res) => {
    const { status, search } = req.query;
    
    let sql = `
        SELECT c.*, 
               t.tenant_id, t.full_name, t.phone, t.email,
               r.room_number, r.house_id, r.base_rent,
               h.house_name,
               (SELECT i.status 
                FROM invoices i 
                WHERE i.contract_id = c.contract_id 
                ORDER BY i.due_date DESC 
                LIMIT 1) as payment_status,
               (SELECT ua.username FROM user_accounts ua WHERE ua.tenant_id = t.tenant_id LIMIT 1) as has_account
        FROM contracts c
        JOIN tenants t ON c.tenant_id = t.tenant_id
        JOIN rooms r ON c.room_id = r.room_id
        JOIN boarding_houses h ON r.house_id = h.house_id
        WHERE 1=1
    `;
    
    const params = [];

    // Lọc theo trạng thái
    if (status && status !== 'All') {
        sql += ` AND c.status = ?`;
        params.push(status); // Active, Expired, Terminated
    }

    // Tìm kiếm
    if (search) {
        sql += ` AND (t.full_name LIKE ? OR t.phone LIKE ? OR r.room_number LIKE ?)`;
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    // Sắp xếp mới nhất lên đầu
    sql += ` ORDER BY c.created_at DESC`;

    try {
        const [rows] = await pool.execute(sql, params);
        
        // Extract password từ notes cho mỗi contract
        const contractsWithPassword = rows.map(contract => {
            if (contract.notes) {
                const passwordMatch = contract.notes.match(/PASSWORD:(\d+)/);
                if (passwordMatch) {
                    contract.password = passwordMatch[1];
                }
            }
            return contract;
        });
        
        res.json(contractsWithPassword);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi lấy danh sách hợp đồng');
    }
});

// 2. Lấy Chi tiết 1 Hợp đồng
app.get('/api/contracts/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT c.*, 
                   t.full_name, t.phone, t.email, t.id_card_number, t.id_card_photos,
                   r.room_number, r.house_id
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.tenant_id
            JOIN rooms r ON c.room_id = r.room_id
            WHERE c.contract_id = ?
        `, [req.params.id]);

        if (rows.length === 0) return res.status(404).json({message: "Không tìm thấy hợp đồng"});
        
        // Lấy password từ notes nếu có
        const contract = rows[0];
        if (contract.notes) {
            const passwordMatch = contract.notes.match(/PASSWORD:(\d+)/);
            if (passwordMatch) {
                contract.password = passwordMatch[1];
            }
        }
        
        res.json(contract);
    } catch (err) {
        console.error('Error fetching contract details:', err);
        res.status(500).json({message: 'Lỗi server khi lấy thông tin hợp đồng: ' + err.message});
    }
});

// 3. Cập nhật thông tin Hợp đồng
app.put('/api/contracts/:id', async (req, res) => {
    const { start_date, end_date, deposit_amount, rent_amount, notes, status, password } = req.body;
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Lấy tenant_id từ contract
        const [contractRows] = await connection.execute(
            'SELECT tenant_id FROM contracts WHERE contract_id = ?',
            [req.params.id]
        );
        
        if (contractRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });
        }
        
        const tenantId = contractRows[0].tenant_id;
        
        console.log(`[UPDATE CONTRACT] Received data:`, { password: password ? '***' : 'none', passwordLength: password ? password.length : 0, status, notes });
        
        // Cập nhật mật khẩu nếu có
        if (password && password.trim().length >= 6) {
            console.log(`[UPDATE CONTRACT] Updating password for contract ${req.params.id}, tenant ${tenantId}`);
            const plainPassword = password.trim();
            
            // Lưu password plain text (không hash) vào password_hash
            console.log(`[UPDATE CONTRACT] Saving plain text password to database`);
            
            // Cập nhật password_hash trong bảng user_accounts
            // Kiểm tra xem có tài khoản chưa, nếu chưa thì tạo mới
            const [existingAccount] = await connection.execute(
                'SELECT user_id FROM user_accounts WHERE tenant_id = ?',
                [tenantId]
            );
            
            if (existingAccount.length > 0) {
                // Cập nhật password plain text cho tài khoản đã có
                console.log(`[UPDATE CONTRACT] Updating existing user_account password`);
                const [updateResult] = await connection.execute(
                    'UPDATE user_accounts SET password_hash = ? WHERE tenant_id = ?',
                    [plainPassword, tenantId]
                );
                console.log(`[UPDATE CONTRACT] Password updated, affected rows: ${updateResult.affectedRows}`);
            } else {
                // Tạo tài khoản mới nếu chưa có
                console.log(`[UPDATE CONTRACT] Creating new user_account`);
                const [tenantInfo] = await connection.execute(
                    'SELECT phone FROM tenants WHERE tenant_id = ?',
                    [tenantId]
                );
                if (tenantInfo.length > 0) {
                    const [insertResult] = await connection.execute(
                        `INSERT INTO user_accounts (tenant_id, username, password_hash, role, is_active)
                         VALUES (?, ?, ?, 'Tenant', 1)`,
                        [tenantId, tenantInfo[0].phone, plainPassword]
                    );
                    console.log(`[UPDATE CONTRACT] User_account created, insertId: ${insertResult.insertId}`);
                } else {
                    console.error(`[UPDATE CONTRACT] ERROR: Tenant not found for tenant_id ${tenantId}`);
                }
            }
            
            // Cập nhật notes để lưu password mới (xóa password cũ, thêm password mới)
            const [currentContract] = await connection.execute(
                'SELECT notes FROM contracts WHERE contract_id = ?',
                [req.params.id]
            );
            
            let updatedNotes = notes || '';
            if (currentContract.length > 0 && currentContract[0].notes) {
                // Xóa password cũ khỏi notes (nếu có)
                let currentNotes = currentContract[0].notes.replace(/PASSWORD:\d+/g, '').trim();
                // Nếu có notes mới từ user, dùng notes mới, không thì giữ notes cũ (đã xóa password)
                if (notes && notes.trim()) {
                    updatedNotes = notes.trim();
                } else {
                    updatedNotes = currentNotes;
                }
            }
            // Thêm password mới vào notes
            updatedNotes = (updatedNotes ? updatedNotes + '\n' : '') + `PASSWORD:${plainPassword}`;
            console.log(`[UPDATE CONTRACT] Updated notes with password`);
            
            // Cập nhật hợp đồng với notes mới
            await connection.execute(`
                UPDATE contracts 
                SET start_date=?, end_date=?, deposit_amount=?, rent_amount=?, notes=?, status=?
                WHERE contract_id=?
            `, [start_date, end_date, deposit_amount, rent_amount, updatedNotes, status || null, req.params.id]);
            console.log(`[UPDATE CONTRACT] Contract updated successfully`);
        } else {
            // Cập nhật thông tin hợp đồng (không đổi password)
            // Nhưng vẫn giữ password cũ trong notes nếu có
            let finalNotes = notes || '';
            if (!finalNotes) {
                // Nếu không có notes mới, lấy notes cũ (có thể có password)
                const [currentContract] = await connection.execute(
                    'SELECT notes FROM contracts WHERE contract_id = ?',
                    [req.params.id]
                );
                if (currentContract.length > 0 && currentContract[0].notes) {
                    finalNotes = currentContract[0].notes;
                }
            } else {
                // Nếu có notes mới, kiểm tra xem có password trong notes cũ không
                const [currentContract] = await connection.execute(
                    'SELECT notes FROM contracts WHERE contract_id = ?',
                    [req.params.id]
                );
                if (currentContract.length > 0 && currentContract[0].notes) {
                    const passwordMatch = currentContract[0].notes.match(/PASSWORD:\d+/);
                    if (passwordMatch) {
                        // Giữ password cũ
                        finalNotes = notes + '\n' + passwordMatch[0];
                    }
                }
            }
            
            await connection.execute(`
                UPDATE contracts 
                SET start_date=?, end_date=?, deposit_amount=?, rent_amount=?, notes=?, status=?
                WHERE contract_id=?
            `, [start_date, end_date, deposit_amount, rent_amount, finalNotes, status || null, req.params.id]);
        }
        
        // Nếu status là Terminated hoặc Expired, cập nhật phòng về Vacant và is_current = 0
        if (status === 'Terminated' || status === 'Expired' || status === 'Unoccupied') {
            const [contractRows] = await connection.execute('SELECT room_id FROM contracts WHERE contract_id = ?', [req.params.id]);
            if (contractRows.length > 0) {
                await connection.execute(
                    `UPDATE rooms SET status = 'Vacant' WHERE room_id = ?`,
                    [contractRows[0].room_id]
                );
                await connection.execute(
                    `UPDATE contracts SET is_current = 0 WHERE contract_id = ?`,
                    [req.params.id]
                );
            }
        } else if (status === 'Active') {
            // Nếu chuyển về Active, cập nhật phòng về Occupied và is_current = 1
            const [contractRows] = await connection.execute('SELECT room_id FROM contracts WHERE contract_id = ?', [req.params.id]);
            if (contractRows.length > 0) {
                await connection.execute(
                    `UPDATE rooms SET status = 'Occupied' WHERE room_id = ?`,
                    [contractRows[0].room_id]
                );
                await connection.execute(
                    `UPDATE contracts SET is_current = 1 WHERE contract_id = ?`,
                    [req.params.id]
                );
            }
        }
        
        await connection.commit();
        console.log(`[UPDATE CONTRACT] Transaction committed successfully`);
        res.json({ message: 'Cập nhật thành công' });
    } catch (err) {
        await connection.rollback();
        console.error(`[UPDATE CONTRACT] ERROR:`, err);
        console.error(`[UPDATE CONTRACT] Error stack:`, err.stack);
        res.status(500).send('Lỗi cập nhật: ' + err.message);
    } finally {
        connection.release();
    }
});

// 4. Chấm dứt Hợp đồng
app.put('/api/contracts/:id/terminate', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Cập nhật trạng thái Hợp đồng -> Terminated
        await connection.execute(
            `UPDATE contracts SET status = 'Terminated', is_current = 0 WHERE contract_id = ?`, 
            [req.params.id]
        );

        // 2. Lấy room_id từ hợp đồng để trả phòng
        const [rows] = await connection.execute('SELECT room_id FROM contracts WHERE contract_id = ?', [req.params.id]);
        if(rows.length > 0) {
            const roomId = rows[0].room_id;
            // 3. Cập nhật trạng thái Phòng -> Vacant
            await connection.execute(
                `UPDATE rooms SET status = 'Vacant' WHERE room_id = ?`, 
                [roomId]
            );
        }

        await connection.commit();
        res.json({ message: 'Đã chấm dứt hợp đồng và trả phòng thành công' });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Lỗi khi chấm dứt hợp đồng');
    } finally {
        connection.release();
    }
});

    // 5. API Thống kê Hợp đồng (Active, Terminated, Expired...)
app.get('/api/contract-stats', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END), 0) as active,
                COALESCE(SUM(CASE WHEN status = 'Terminated' THEN 1 ELSE 0 END), 0) as \`terminated\`,
                COALESCE(SUM(CASE WHEN status = 'Expired' THEN 1 ELSE 0 END), 0) as expired
            FROM contracts
        `);
        
        // Trả về object chứa số liệu, đảm bảo là số không phải null
        const stats = rows[0] || { active: 0, terminated: 0, expired: 0 };
        res.json({
            active: parseInt(stats.active) || 0,
            terminated: parseInt(stats.terminated) || 0,
            expired: parseInt(stats.expired) || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ active: 0, terminated: 0, expired: 0 });
    }
});

// --- 2. API TẠO HỢP ĐỒNG MỚI (CÓ UPLOAD FILE) ---
// upload.fields cho phép nhận nhiều loại file khác nhau
app.post('/api/contracts', upload.fields([
    { name: 'cccd_front', maxCount: 1 }, // Ảnh mặt trước
    { name: 'cccd_back', maxCount: 1 },  // Ảnh mặt sau
    { name: 'contract_pdf', maxCount: 1 } // File PDF
]), async (req, res) => {
    
    // Lấy dữ liệu văn bản từ req.body
    const { room_id, full_name, phone, start_date, end_date, deposit_amount, rent_amount, notes } = req.body;
    
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Xử lý đường dẫn file
        let cccdPathArray = [];
        if (req.files['cccd_front']) cccdPathArray.push('/uploads/' + req.files['cccd_front'][0].filename);
        if (req.files['cccd_back']) cccdPathArray.push('/uploads/' + req.files['cccd_back'][0].filename);
        
        let pdfPath = null;
        if (req.files['contract_pdf']) {
            pdfPath = '/uploads/' + req.files['contract_pdf'][0].filename;
        }

        // 2. Tạo hoặc Cập nhật Khách thuê (Tenants)
        // Kiểm tra xem khách đã tồn tại chưa (qua số điện thoại)
        const [existingTenant] = await connection.query('SELECT tenant_id FROM tenants WHERE phone = ?', [phone]);
        let tenantId;

        if (existingTenant.length > 0) {
            tenantId = existingTenant[0].tenant_id;
            // Nếu có ảnh mới thì update ảnh CCCD, không thì giữ nguyên
            if (cccdPathArray.length > 0) {
                await connection.query('UPDATE tenants SET id_card_photos = ? WHERE tenant_id = ?', 
                    [JSON.stringify(cccdPathArray), tenantId]);
            }
        } else {
            // Tạo khách mới
            const [newTenant] = await connection.query(
                `INSERT INTO tenants (full_name, phone, id_card_number, id_card_photos) 
                 VALUES (?, ?, ?, ?)`,
                [full_name, phone, 'PENDING_' + Date.now(), JSON.stringify(cccdPathArray)] 
                // id_card_number tạm thời active pending nếu form ko gửi lên
            );
            tenantId = newTenant.insertId;
        }

        // 3. Tạo Hợp đồng (Contracts)
        const [contractResult] = await connection.query(
            `INSERT INTO contracts (room_id, tenant_id, start_date, end_date, deposit_amount, rent_amount, notes, contract_file_url, status, is_current)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1)`,
            [room_id, tenantId, start_date, end_date, deposit_amount, rent_amount, notes, pdfPath]
        );
        const contractId = contractResult.insertId;

        // 4. Cập nhật trạng thái phòng -> Occupied
        await connection.query('UPDATE rooms SET status = "Occupied" WHERE room_id = ?', [room_id]);

        // 5. Tạo tài khoản cho khách thuê (LUÔN tạo password mới cho hợp đồng mới)
        let generatedPassword = null;
        
        // Tạo password đơn giản: 6 chữ số ngẫu nhiên
        generatedPassword = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`[CREATE CONTRACT] Generated password for tenant ${tenantId}: ${generatedPassword}`);
        
        // Lưu password plain text (không hash) vào password_hash
        console.log(`[CREATE CONTRACT] Saving plain text password to database`);
        
        // Kiểm tra xem đã có tài khoản chưa
        const [existingAccount] = await connection.query(
            'SELECT user_id FROM user_accounts WHERE tenant_id = ?', 
            [tenantId]
        );

        if (existingAccount.length === 0) {
            // Tạo tài khoản mới với password plain text
            console.log(`[CREATE CONTRACT] Creating new user_account for tenant ${tenantId}`);
            await connection.query(
                `INSERT INTO user_accounts (tenant_id, username, password_hash, role, is_active)
                 VALUES (?, ?, ?, 'Tenant', 1)`,
                [tenantId, phone, generatedPassword]
            );
            console.log(`[CREATE CONTRACT] User account created successfully`);
        } else {
            // Cập nhật password plain text cho tài khoản đã có
            console.log(`[CREATE CONTRACT] Updating password for existing account`);
            await connection.query(
                'UPDATE user_accounts SET password_hash = ? WHERE tenant_id = ?',
                [generatedPassword, tenantId]
            );
            console.log(`[CREATE CONTRACT] Password updated successfully`);
        }
        
        // Lưu password gốc (chưa hash) vào notes của contract (format: PASSWORD:123456)
        // Để có thể hiển thị lại cho người dùng
        const updatedNotes = notes ? `${notes}\nPASSWORD:${generatedPassword}` : `PASSWORD:${generatedPassword}`;
        await connection.query(
            'UPDATE contracts SET notes = ? WHERE contract_id = ?',
            [updatedNotes, contractId]
        );
        console.log(`[CREATE CONTRACT] Password saved to contract notes`);

        await connection.commit();
        console.log(`[CREATE CONTRACT] Transaction committed successfully`);
        console.log(`[CREATE CONTRACT] Generated password: ${generatedPassword}`);
        
        res.json({ 
            message: 'Tạo hợp đồng thành công',
            password: generatedPassword,
            contract_id: contractId
        });

    } catch (err) {
        await connection.rollback();
        console.error(`[CREATE CONTRACT] ERROR:`, err);
        console.error(`[CREATE CONTRACT] Error stack:`, err.stack);
        res.status(500).send('Lỗi tạo hợp đồng: ' + err.message);
    } finally {
        connection.release();
    }
});

// Khởi chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});