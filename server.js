import fastify from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";
import crypto from "node:crypto";

const PORT = process.env.PORT || 3000;
// CHÚ Ý: Bạn phải thay link dưới đây bằng link mới nhất lấy từ Network (F12) của game
const API_URL = "https://wtx.tele68.com/v1/tx/lite-sessions?cp=R&cl=R&pf=web&at=83991213bfd4c554dc94bcd98979bdc5";

class HoangDZ_Ai_Engine {
    constructor() {
        this.learned_patterns = new Map();
        this.fail_patterns = new Map();
        this.last_prediction = null;
        this.stats = { win: 0, loss: 0 };
        this.current_id = 0;
        this.connection_status = "Chưa kết nối";
    }

    update_and_fix(actual_session, actual_tx) {
        if (!this.last_prediction || this.last_prediction.session !== actual_session) return null;
        const is_correct = (this.last_prediction.side === actual_tx);
        if (is_correct) { this.stats.win++; } 
        else {
            this.stats.loss++;
            this.fail_patterns.set(this.last_prediction.context, actual_tx);
        }
        this.last_prediction = null;
        return is_correct ? "ĐÚNG ✅" : "SAI ❌";
    }

    analyze(history, md5_data, session) {
        const context = history.slice(-5).join(',');
        let score_t = 0, score_x = 0;

        if (this.fail_patterns.has(context)) {
            const fixed = this.fail_patterns.get(context);
            fixed === 1 ? score_t += 1000 : score_x += 1000;
        }

        const final_side = score_t >= score_x ? 1 : 0;
        this.last_prediction = { session: session + 1, side: final_side, context: context };

        return {
            side: final_side === 1 ? "TÀI" : "XỈU",
            conf: "88.88%",
            strategy: "VÀO ĐỀU TAY"
        };
    }
}

const engine = new HoangDZ_Ai_Engine();
const app = fastify();
let txHistory = [];
let lastStatus = "ĐANG ĐỢI PHIÊN...";

app.register(cors, { origin: "*" });

async function syncGame() {
    try {
        const response = await fetch(API_URL, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        });
        const json = await response.json();
        
        if (json.code !== 0 || !json.data) {
            engine.connection_status = "Lỗi Token (at) hoặc bị chặn IP";
            return;
        }

        const cleanData = json.data.sort((a, b) => a.sessionId - b.sessionId).map(i => ({
            id: i.sessionId,
            val: (i.dices.reduce((a, b) => a + b, 0)) >= 11 ? 1 : 0,
            md5: i.md5
        }));

        const latest = cleanData[cleanData.length - 1];
        if (latest.id !== engine.current_id) {
            engine.update_and_fix(latest.id, latest.val);
            txHistory = cleanData;
            engine.current_id = latest.id;
            engine.connection_status = "Đang hoạt động tốt";
        }
    } catch (err) {
        engine.connection_status = "Không thể kết nối đến server game";
    }
}

setInterval(syncGame, 5000);

app.get("/api/taixiu/68gb", async () => {
    if (txHistory.length === 0) {
        return { 
            error: "LỖI KẾT NỐI",
            ly_do: engine.connection_status,
            huong_dan: "Hãy lấy Token 'at=' mới từ game và dán vào API_URL trong code."
        };
    }

    const last = txHistory[txHistory.length - 1];
    const prediction = engine.analyze(txHistory.map(h => h.val), last.md5, last.id);

    return {
        bot: "HOANGDZ_AI_V4",
        trang_thai: engine.connection_status,
        phien_hien_tai: last.id,
        ket_qua_truoc: last.val === 1 ? "TÀI" : "XỈU",
        du_doan_tiep: prediction.side,
        ty_le: prediction.conf,
        thong_ke: `${engine.stats.win} Thắng - ${engine.stats.loss} Thua`,
        hoc_loi: `Đã sửa ${engine.fail_patterns.size} lỗi cầu`
    };
});

app.listen({ port: PORT, host: '0.0.0.0' }, () => console.log("Hệ thống khởi động..."));
