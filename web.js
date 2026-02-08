// const express = require('express');
// const cors = require('cors');
// const mysql = require('mysql2');
import { SMTPClient } from 'emailjs'; // 정적 import
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import 'log-timestamp';
import { genkit } from 'genkit/beta';
import { googleAI } from '@genkit-ai/google-genai';
import { createInterface } from 'node:readline/promises';

dotenv.config();

const app = express();
const port = 3000;
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
    queueLimit: 0,
});

const empty = [undefined, 'undefined', null, 'null', '', ' ', 'Invaild Date'];
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uploadPath = path.join(__dirname, '/uploads');

const secretKey = 'MySecret Key';

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.send('Server is running');
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath); // 업로드 경로
    },
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname);
        const fileName = path.basename(file.originalname, fileExt);
        cb(null, `${fileName}-${Date.now()}${fileExt}`);
    }
});
const upload = multer({ storage }); // multer 인스턴스 생성

app.use(cors({
    origin: [
        'https://exam-website-fe211.web.app',
        'https://exam-website-fe211.firebaseapp.com',
        'https://examwebsite-1993.duckdns.org',
        'https://134.185.117.189',
        'http://134.185.117.189',
        'http://examwebsite-1993.duckdns.org'
    ],
    credentials: true
}));
app.use(express.json());

//#region email

const myMail = process.env.MAILJS_ID;
const myMailPw = process.env.MAILJS_PW;
const myMailHost = "smtp.naver.com";
const myMailPort = 465;

const client = new SMTPClient({
    user: myMail,
    password: myMailPw,
    host: myMailHost,
    port: myMailPort,
    ssl: true
});

//#endregion 

//#region Member

app.get('/member-check', (req, res) => {
    let user_id = req.query.userId;
    let query;
    let params = [];

    query = `SELECT user_id FROM member WHERE user_id = ?`;
    params = [user_id];
    pool.query(query, params, (error, rows) => {
        if (error) res.send({ result: !false });
        res.send({ rows: rows });
    });
});

app.post('/login', (req, res) => {
    const user_id = req.body.userId;
    const user_pw = req.body.userPw;
    const params = [user_id, user_pw];

    const query = 'SELECT * FROM member WHERE user_id = ? AND user_pw = ?';

    pool.query(query, params, (error, rows) => {
        if (error || rows.length === 0) {
            res.send({
                result: !false,
            });
        } else {
            const token = jwt.sign({ user_id: rows[0].user_id }, secretKey, { expiresIn: '3h' }); // 토큰 생성
            res.send({
                token: token, // 토큰을 응답에 포함
                rows: rows
            });
        }
    });
});

app.get('/changepw-email', async (req, res) => {
    const user_id = req.query.userId;
    const user_pw = req.query.userPw;
    let query = '';
    let params = [user_id];

    query = `SELECT * FROM MEMBER WHERE user_id = ?`;

    pool.query(query, params, async (error, rows1) => {
        if (error || rows1.length === 0) {
            res.send({
                result: !false
            });
        } else {
            client.send({
                text: `${user_pw}은 임시 비밀번호 입니다. 반드시 변경해주세요`,
                from: myMail,
                to: user_id,
                subject: '임시비밀번호 안내입니다.',
            },
                (err, message) => {
                    console.log(err || message);
                });
            query = `UPDATE member SET user_pw = '${user_pw}' WHERE user_id = ?`;

            pool.query(query, params, (error, rows2) => {
                if (error) {
                    res.send({
                        result: !false
                    });
                } else {
                    const token = jwt.sign({ user_id: user_id }, secretKey, { expiresIn: '3h' }); // 토큰 생성
                    res.send({
                        userData: rows1,
                        token: token
                    })
                }
            });
        }
    });
});

app.post('/member-create', (req, res) => {
    const user_id = req.body.userId;
    const user_pw = req.body.userPw;
    const user_name = req.body.userName;
    let values = [user_id, user_pw, user_name]
    let query = `INSERT INTO member (user_id, user_pw, user_name) VALUES ( ? )`;

    pool.query(query, [values], (error, rows) => {
        if (error) res.send({ data: error });
        res.send({ rows });
    });
});

app.get('/member-info', (req, res) => {
    const token = req.headers['authorization'].split(' ')[1];

    jwt.verify(token, secretKey, (err, userData) => {
        if (userData !== undefined) {
            const userId = userData.user_id;
            const query = `SELECT * FROM member WHERE user_id = '${userId}'`;

            pool.query(query, (error, rows) => {
                res.send({ rows: rows });
            });
        }
    });
});

app.put('/member-changepw', (req, res) => {
    const user_id = req.body.userId;
    const user_pw = req.body.userPw;
    const query = `UPDATE member SET user_pw = '${user_pw}' WHERE user_id = '${user_id}'`;

    pool.query(query, (error, rows) => {
        if (error) res.send({ result: !false });
        res.send({ rows: rows });
    });

});

//#endregion 

//#region Board

app.get('/board', (req, res) => {
    const page = req.query.page;
    const countPage = req.query.countPage;
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
    const serach_data = req.query.serach_data;
    const where = [];

    if (start_date) {
        where.push(`update_date BETWEEN '${start_date}' AND '${end_date}'`);
    } else {
        where.push(`update_date <= '${end_date}'`);
    }

    if (serach_data) where.push(`AND board_title LIKE '%${serach_data}%'`);

    const whereClause = where.join(' AND ');

    const query = `SELECT * FROM board 
    WHERE ${whereClause}
    ORDER BY board_id DESC
    LIMIT ${countPage} OFFSET ${page}`;

    pool.query(query, (error, rows) => {
        if (error) return res.send({ result: !false });
        return res.send({ result: rows });
    });
});

app.post('/board', (req, res) => {
    const list = req.body.list;
    const keys = [];
    const values = [];

    Object.entries(list).forEach(([key, value]) => {
        keys.push(key),
            values.push(value)
    });

    let query = `INSERT INTO board (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
    pool.query(query, values, (error, rows) => {
        if (error) return res.send({ result: !false });
        return res.send({ result: rows });
    });
});

app.put('/board', (req, res) => {
    const list = req.body.list;
    const keys = [];
    const values = [];

    Object.entries(list).forEach(([key, value]) => {
        if (key !== 'board_id' && key !== 'update_date') { // board_id 제외!
            keys.push(`${key} = ?`);
            values.push(value);
        }
    });

    const query = `UPDATE board SET ${keys.join(',')}, update_date = NOW() WHERE board_id = ?`;
    values.push(list.board_id);

    pool.query(query, values, (error, rows) => {
        if (error) res.send({ result: !false, error: error.message });
        res.send({ result: !true });
    });
});

app.get('/board-data', (req, res) => {
    const board_id = req.query.board_id;
    let query = '';

    try {
        query = `SELECT * FROM board WHERE board_id = '${board_id}';`;
        pool.query(query, (error, rows) => {
            if (error) res.send({ result: !false });
            res.send({ result: rows });
        });

        query = `UPDATE board SET board_checkNum =  COALESCE(board_checkNum, 0) + 1 WHERE board_id = '${board_id}';`;

        pool.query(query, (error, updateResult) => {
            if (error) return res.send({ result: !false });
        });
    } catch (error) {
        console.log(error);
        res.send({ result: !false });
    }


});

//#endregion 

//#region Exam

app.get('/exams', (req, res) => {
    const query = `SELECT * FROM exams;`;

    pool.query(query, (error, rows) => {
        res.send({ rows });
    });
});

app.get('/exam', (req, res) => {
    const exam_id = req.query.exam_id;
    const exam_name = req.query.exam_name;
    let query = '';
    let where = [];

    exam_id === undefined || exam_id === '' ? where.push(`WHERE exam_name = '${exam_name}'`) : where.push(`WHERE exam_id = '${exam_id}'`);

    query = `SELECT * FROM exams ${where}`;

    pool.query(query, (error, rows) => {
        if (error) res.send({ result: !false })
        res.send({ rows: rows })
    });
});

app.post('/exam', (req, res) => {
    const examStorage = req.body.examStorage;
    const subjectStorage = req.body.subjectStorage;
    const keys = [];
    const values = [];
    const integerArray = ['exam_time', 'exam_total', 'pass_score'];


    Object.values(examStorage).forEach((exam) => {
        Object.entries(exam).forEach(([key, value]) => {
            keys.push(key);
            integerArray.includes(key) ? values.push(parseInt(value)) : values.push(`${value}`);
        });
    });

    const query = `INSERT INTO exams(${keys.join(',')}) VALUES(${values.map(() => '?').join(',')});`;
    pool.query(query, values, (error, rows) => {
        if (error) {
            res.send({ result: !false });
        } else {
            const lastId = rows.insertId;

            try {
                subjectStorage.forEach(subject => {
                    const where_1 = [];
                    const where_2 = [];

                    Object.entries(subject).forEach(([key, value]) => {
                        where_1.push(key);
                        where_2.push(value);
                    });

                    where_1.push("exam_id");
                    where_2.push(lastId)
                    const query_1 = `INSERT INTO subjects (${where_1.join(',')}) VALUES (${where_1.map(() => '?').join(',')});`;
                    pool.query(query_1, where_2, (error) => {
                        if (error) return console.log(error.message);
                    });
                });

                return res.send({ result: true });
            } catch (error) {
                return res.send({ result: false })
            }

        }
    });
});

app.put('/exam', (req, res) => {
    const exam_id = req.body.exam_id;
    const examStorage = req.body.examStorage;
    const subject = req.body.subject;
    const exam_keys = [];
    const exam_value = [];

    examStorage.forEach(exam => {
        Object.entries(exam).forEach(([key, value]) => {
            exam_keys.push(key);
            exam_value.push(value);
        });
    });
    exam_value.push(exam_id)
    const setClause = exam_keys.map(key => `${key} = ?`).join(', ');
    const query = `UPDATE exams SET ${setClause} WHERE exam_id = ?;`;

    pool.query(query, exam_value, (error, rows) => {
        if (error) return res.send({ result: !false });
        if (subject === undefined) return;
        let err = true;

        const query_1 = `REPLACE INTO subjects(subject_id, subject, count, min_score, exam_id) VALUES (?, ?, ?, ?, ?);`;
        for (const s of subject) {
            const params_1 = [s.subject_id, s.subject, s.count, s.min_score, exam_id];
            pool.query(query_1, params_1, (error) => {
                if (error) {
                    console.log(error);
                    err = false;
                }
            });
        }

        if (!err) {
            return res.send({ result: false });
        } else {
            return res.send({ result: true });
        }
    });
});

app.delete('/exam', (req, res) => {
    const exam_id = req.query.exam_id;

    const query = `DELETE FROM exams WHERE exam_id = '${exam_id}';`;

    pool.query(query, (error, rows) => {
        if (error) res.send({ result: !false })
        res.send({ result: !true })
    });
});

//#endregion

//#region subject

app.get('/exam-join-subject', (req, res) => {
    const exam_id = req.query.exam_id;

    const query = `SELECT e.*, s.*
                FROM exams AS e
                LEFT JOIN subjects AS s
                ON e.exam_id = s.exam_id
                WHERE e.exam_id = ${exam_id};`;

    pool.query(query, (error, rows) => {
        if (error) res.send({ result: !false });
        res.send({ rows: rows });
    });
});

app.get('/subject', (req, res) => {
    const exam_id = req.query.exam_id;

    const query = `SELECT * FROM subjects WHERE exam_id = ${exam_id};`;
    pool.query(query, (error, rows) => {
        if (error) res.send({ result: !false });
        res.send({ rows: rows });
    });
});

app.delete('/subject', (req, res) => {
    const subject_id = req.query.subject_id;
    const exam_id = req.query.exam_id;

    const query = `DELETE FROM subjects WHERE subject_id = '${subject_id}' AND exam_id = ${exam_id};`;

    pool.query(query, (error, rows) => {
        if (error) res.send({ result: !false });
        res.send({ result: !true });
    });
});

// #endregion

//#region Question

app.post('/question', (req, res) => {
    const exam_id = req.body.exam_id
    const today = req.body.today;
    const subject_id = req.body.subject_id;
    const questionStorages = req.body.questionStorages;
    const problemStorages = req.body.problemStorages;
    const columns_1 = [];
    const worth_1 = [];

    columns_1.push('exam_id');
    columns_1.push('create_date');
    columns_1.push('subject_id');
    worth_1.push(exam_id);
    worth_1.push(`${today}`);
    worth_1.push(subject_id);

    Object.entries(questionStorages).forEach(([key, value]) => {
        columns_1.push(key);
        worth_1.push(value);
    });

    const query_1 = `INSERT INTO questions(${columns_1.join(',')}) VALUES (${worth_1.map(() => '?').join(',')});`;
    pool.query(query_1, worth_1, async (error, rows_1) => {
        if (error) return res.send({ result: false });

        const columns_2 = [];
        const worth_2 = [];
        const lastId = await rows_1.insertId;

        columns_2.push('exam_id');
        columns_2.push('question_id');
        worth_2.push(exam_id);
        worth_2.push(lastId);

        Object.entries(problemStorages).forEach(([key, value]) => {
            columns_2.push(key);
            worth_2.push(value);
        });

        const query_2 = `INSERT INTO problems(${columns_2.join(',')}) VALUES (${worth_2.map(() => '?').join(',')});`;
        pool.query(query_2, worth_2, (error, rows_2) => {
            if (error) return res.send({ result: false })
            res.send({ result: true })
        });
    });
});

app.delete('/question', (req, res) => {
    const question_id = req.query.question_id;
    const problem_id = req.query.problem_id;

    const problemQuery = `DELETE FROM problems WHERE problem_id = ?`;
    const questionQuery = `DELETE FROM questions WHERE question_id = ?;`;

    pool.query(problemQuery, problem_id, (error, rows) => {
        if (error) return res.send({ result: false });

        pool.query(questionQuery, question_id, (error, rows) => {
            if (error) return res.send({ result: false });
            return res.send({ result: true });
        });
    });
});

app.put('/question', (req, res) => {
    const questionStorages = req.body.questionStorages;
    const image = req.body.image;
    const columns_1 = [];
    const columns_2 = [];

    const updateQuestionQuery = `UPDATE questions SET 
    question = ?, point = ?, type = ?, year = ?, round = ?, level = ?, 
    subject_id = ? WHERE question_id = ?`;

    columns_1.push(questionStorages.question, questionStorages.point, questionStorages.type, questionStorages.year,
        questionStorages.round, questionStorages.level, questionStorages.subject_id, questionStorages.question_id);

    const updateProblemQuery = `UPDATE problems SET 
    problem = ?, answer = ?, explanation = ?, feedback = ?, image = ?,
    exam_id = ? WHERE problem_id = ?`;

    columns_2.push(questionStorages.problem, questionStorages.answer, questionStorages.explanation, questionStorages.feedback,
        image, questionStorages.exam_id, questionStorages.problem_id);

    pool.query(updateQuestionQuery, columns_1, (error, rows) => {
        if (error) return res.send({ result: false });

        pool.query(updateProblemQuery, columns_2, (error, rows) => {
            if (error) return res.send({ result: false });
            res.send({ result: true });
        });
    });
});

app.get('/question-problem-group-desc', (req, res) => {
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
    const question_type = req.query.question_type;
    const question_year = req.query.question_year;
    const question_round = req.query.question_round;
    const question_level = req.query.question_level;
    const exam_id = req.query.exam_id;
    const page = req.query.page;
    const countPage = req.query.countPage;
    const where_1 = [];
    const where_2 = [];
    let query = '';

    start_date === undefined ? where_1.push(`create_date <= '${end_date}'`) : where_1.push(`create_date between '${start_date}' AND '${end_date}'`)

    question_type === undefined ? '' : where_2.push(`question_type = '${question_type}'`);
    question_year === undefined ? '' : where_2.push(`question_year = '${question_year}'`);
    question_round === undefined ? '' : where_2.push(`question_round = '${question_round}'`);
    question_level === undefined ? '' : where_2.push(`question_level = '${question_level}'`);
    exam_id === undefined ? '' : where_2.push(`exam_id = '${exam_id}'`);

    query = 'SELECT COUNT(*) / 30 AS total_page FROM questions;';

    if (where_2.length === 0) {
        const page = req.query.page;
        query += `SELECT * FROM questions
        WHERE ${where_1}
        ORDER BY create_date DESC
        LIMIT ${countPage} OFFSET ${page} ;`;
    } else {
        query += `SELECT * FROM questions
        WHERE ${where_1} AND ${where_2.join('AND')}
        ORDER BY create_date DESC
        LIMIT ${countPage} OFFSET ${page};`;
    }

    pool.query(query, (error, rows) => {
        if (error) res.send({ result: !false });
        res.send({
            total_page: rows[0],
            rows: rows[1]
        });
    });

});

app.get('/question-with-problem', async (req, res) => {
    const subject_id = req.query.subject_id;
    const exam_id = req.query.exam_id;

    const query = `SELECT e.*, q.*, p.*, s.*
            FROM questions AS q
            INNER JOIN problems AS p
            ON q.question_id = p.question_id
            INNER JOIN exams AS e
            ON e.exam_id = q.exam_id
            INNER JOIN subjects AS s
            ON s.exam_id = q.exam_id
            WHERE q.exam_id = ? AND s.subject_id = ?;`;
    pool.query(query, [exam_id, subject_id], (error, rows) => {
        if (error) return res.send({ result: false });
        return res.send({ rows: rows });
    });
});

//#endregion

//#region test Exam

app.get('/start-exam', (req, res) => {
    const where = [];
    const exam_id = req.query.exam_id;
    const subject_id = req.query.subject_id;
    const type = req.query.type;
    const year = req.query.year;
    const round = req.query.round;
    const exam_total = req.query.exam_total;

    where.push(`e.exam_id = '${exam_id}'`);
    empty.includes(subject_id) ? '' : where.push(`s.subject_id = '${subject_id}'`);
    // empty.includes(question_type) ? where.push(`q.question_type = RAND()`) : where.push(`q.question_type = '${question_type}'`);
    // empty.includes(question_year) ? where.push(`q.question_year = RAND()`) : where.push(`q.question_year = '${question_year}'`);
    // empty.includes(question_round) ? where.push(`q.question_round = RAND()`) : where.push(`q.question_round = '${question_round}'`);

    empty.includes(type) ? '' : where.push(`q.type = '${type}'`);
    empty.includes(year) ? '' : where.push(`q.year = '${year}'`);
    empty.includes(round) ? '' : where.push(`q.round = '${round}'`);

    const whereClauses = where.length > 1 ? where.join(' AND ') : `${where} ORDER BY RAND()`;

    const query = `SELECT p.problem_id, p.problem, p.image, p.answer,
            q.question_id, q.question, q.point, e.exam_time, e.pass_score ,s.subject_id
            FROM exams AS e
            INNER JOIN problems AS p
            ON p.exam_id = e.exam_id
            INNER JOIN questions AS q
            ON q.question_id = p.question_id
            INNER join subjects AS s
            ON s.subject_id = q.subject_id
            WHERE ${whereClauses} LIMIT ${exam_total} OFFSET 0;`;

    pool.query(query, (error, rows) => {
        if (error) return res.send({ result: false });
        return res.send({ rows: rows });
    });

});

app.post('/save-exam-result', (req, res) => {
    const list = req.body.list;
    const column = [];
    const values = [];
    const created_at = create_at();

    for (let li of list) {
        Object.entries(li).forEach(q => {
            column.push(q[0]);
            values.push(`'${q[1]}'`);
        });
    }

    column.push('created_at');
    values.push(`'${created_at}'`);

    const query = `INSERT INTO exam_results (${column.join(',')}) VALUES (${values.join(',')});`;
    pool.query(query, (error, rows) => {
        if (error) return res.send({ result: !false });
        return res.send({ result: !true });
    });
});

//#endregion

// #region image
app.post('/image-upload', upload.single('image'), (req, res) => {
    const imagePath = `http://localhost:3000/uploads/${req.file.filename}`; // 업로드된 이미지 경로
    res.json({ imagePath }); // 클라이언트에 경로 반환
});

app.delete('/image-delete', upload.single('image'), (req, res) => {
    const problem_id = req.query.problem_id;
    const filename = req.query.filename;
    const lastIndex = filename.indexOf('uploads');
    const realFilename = filename.slice(lastIndex + 8);

    const filePath = path.join(uploadPath, realFilename);
    fs.unlink(filePath, (err) => {
        if (!err) {
            console.log('err : ', err)
        } else {
            const query = `UPDATE problems SET problem_image = NULL WHERE problem_id = ${problem_id};`;

            pool.query(query, async (error, rows) => {
                if (error) return res.send({ result: !false });
                return res.send({ result: !true });
            })
        }
    });

});
//#endregion

// #region chart

app.get('/chart', (req, res) => {
    const user_id = req.query.user_id;

    const query = `
    
    `;
});

//#endregion

// #region AI

const ai = genkit({
    plugins: [googleAI()],
    model: googleAI.model('gemini-2.5-flash'),
});

app.post('/ai-answer', async (req, res) => {
    const chat = ai.chat();
    const readline = createInterface(process.stdin, process.stdout);
    while (true) {
        const userInput = await readline.question('> ');
        const { text } = await chat.send(userInput);
        console.log(text);
    }
});


//#endregion

// #region Practice

//#endregion

//#region Date

function translate_date(param) {
    const date = new Date(param);
    date.setHours(9);
    const today = date.slice(0, 10);

    return today;
}

function create_at() {
    const date = new Date();
    const utc = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    const today = new Date(utc + (9 * 60 * 60 * 1000));

    return today.toISOString().split('T')[0];;
}

//#endregion
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});