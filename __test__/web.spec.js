import mysql from 'mysql2/promise';

let connection;

beforeAll(async () => {
    /**
   * Connecting MySQL once the test has been started.
   */
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '1234',
            database: process.env.DB_NAME || 'test_db',
            port: process.env.DB_PORT || 3306
        });
        console.log('MySQL connected...');
    } catch (err) {
        console.error('MySQL connection error:', err);
    }
});

afterAll(async () => {
    if (sequelize) {
        await sequelize.close();
        console.log('MySQL connection closed...');
    }
});