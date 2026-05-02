import fastify from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";
import crypto from "node:crypto";

// --- CẤU HÌNH HỆ THỐNG ---
const PORT = process.env.PORT || 3000;
const API_URL = "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=83991213bfd4c554dc94bcd98979bdc5";
const BOT_NAME = "HOANGDZ_ULTIMATE_AI_V4";

class HoangDZ_Ai_Engine {
    constructor() {
        this.pattern_vault = {
            "BET": [[1,1,1,1], [0,0,0,0]],
            "1_1": [[1,0,1,0], [0,1,0,1]],
            "2_2": [[1,1,0,0,1,1], [0,0,1,1,0,0]],
            "3_1": [[1,1,1,0,1,1,1], [0,0,0,1,0,0,0]]
        };
        this.learned_patterns = new Map(); // Lưu cầu thực tế của game
        this.fail_patterns = new Map();    // Lưu lỗi sai để học lại
        this.last_prediction = null;
        this.stats = { win: 0, loss: 0 };
    }

    // --- HÀM HỌC LỖI (SỬA SAI NGAY LẬP TỨC) ---
    update_and_fix(actual_session, actual_tx) {
        if (!this.last_prediction || this.last_prediction.session !== actual_session) return null;

        const is_correct = (this.last_prediction.side === actual_tx);
        const context = this.last_prediction.context;

        if (is_correct) {
            this.stats.win++;
        } else {
            this.stats.loss++;
            // Nếu sai: Lưu chuỗi 5 ván trước đó và ép AI ván sau gặp lại phải đánh ngược lại
            this.fail_patterns.set(context, actual_tx);
            console.log(`[!] HỌC LỖI: Phiên ${actual_session} đoán sai. Đã ghi đè logic cho chuỗi: ${context}`);
        }
        
        const result_status = is_correct ? "ĐÚNG ✅" : "SAI ❌";
        this.last_prediction = null;
        return result_status;
    }

    // --- HÀM HỌC CẦU THỰC TẾ ---
    _learn_game_flow(history) {
        if (history.length < 6) return;
        const context = history.slice(-6, -1).join(',');
        const actual = history[history.length - 1];

        if (!this.learned_patterns.has(context)) {
            this.learned_patterns.set(context, { 1: 0, 0: 0 });
        }
        this.learned_patterns.get(context)[actual]++;
    }

    // --- LOGIC PHÂN TÍCH TỔNG LỰC ---
    analyze(history, md5_data, session) {
        this._learn_game_flow(history);
        const context = history.slice(-5).join(',');
        let score_t = 0, score_x = 0;

        // 1. ƯU TIÊN SỬA SAI (Nếu chuỗi này đã từng sai, đánh ngược lại ngay)
        if (this.fail_patterns.has(context)) {
            const fixed = this.fail_patterns.get(context);
            fixed === 1 ? score_t += 1000 : score_x += 1000;
        }

        // 2. LOGIC HỌC CẦU THỰC TẾ
        if (this.learned_patterns.has(context)) {
            const data = this.learned_patterns.get(context);
            score_t += data[1] * 30;
            score_x += data[0] * 30;
        }

        // 3. LOGIC MD5 (Phân tích mã băm)
        if (md5_data) {
            const hash = crypto.createHash('md5').update(md5_data).digest('hex');
            const bias = (parseInt(hash.slice(-4), 16) % 10) / 10;
            score_t += bias * 50;
            score_x += (1 - bias) * 50;
        }

        const final_side = score_t > score_x ? 1 : 0;
        const total = score_t + score_x || 1;
        const confidence = (Math.max(score_t, score_x) / total) * 100;

        // Lưu dự đoán cho phiên tiếp theo
        this.last_prediction = {
            session: session + 1,
            side: final_side,
            context: context
        };

        return {
            side: final_side === 1 ? "TÀI" : "XỈU",
            conf: `${confidence.toFixed(2)}%`,
            strategy: confidence > 80 ? "VÀO MẠNH (Lách soi)" : "VÀO ĐỀU TAY"
        };
    }
}

// --- KHỞI TẠO SERVER ---
const engine = new HoangDZ_Ai_Engine();
const app = fastify();
let txHistory = [];
let lastStatus = "ĐANG ĐỢI PHIÊN...";

app.register(cors, { origin: "*" });

async function syncGame() {
    try {
        const response = await fetch(API_URL);
        const json = await response.json();
        const list = json.data || [];
        if (!list.length) return;

        const cleanData = list.sort((a, b) => a.sessionId - b.sessionId).map(i => ({
            id: i.sessionId,
            val: (i.dices.reduce((a, b) => a + b, 0)) >= 11 ? 1 : 0,
            md5: i.md5
        }));

        const latest = cleanData[cleanData.length - 1];
        
        // Kiểm tra và học lại nếu có phiên mới
        if (latest.id !== engine.current_id) {
            const res = engine.update_and_fix(latest.id, latest.val);
            if (res) lastStatus = res;
            txHistory = cleanData;
            engine.current_id = latest.id;
        }
    } catch (err) {
        console.error("Lỗi kết nối API");
    }
}

// Cập nhật dữ liệu mỗi 4 giây
setInterval(syncGame, 4000);

app.get("/api/taixiu/68gb", async () => {
    if (txHistory.length < 10) return { error: "Đang nạp dữ liệu cầu..." };

    const last = txHistory[txHistory.length - 1];
    const prediction = engine.analyze(txHistory.map(h => h.val), last.md5, last.id);

    return {
        bot: BOT_NAME,
        phien_hien_tai: last.id,
        ket_qua_truoc: last.val === 1 ? "TÀI" : "XỈU",
        trang_thai_phien_truoc: lastStatus,
        du_doan_tiep_theo: prediction.side,
        ty_le_tin_cay: prediction.conf,
        chien_thuat: prediction.strategy,
        bo_nho_ai: {
            da_hoc: engine.learned_patterns.size,
            sua_loi: engine.fail_patterns.size,
            win_loss: `${engine.stats.win}W - ${engine.stats.loss}L`
        }
    };
});

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) process.exit(1);
    console.log(`🚀 API HOANGDZ LIVE AT PORT ${PORT}`);
});
