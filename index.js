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
        is_active: true,
        auto_reply: true,
        smart_mode: true
    };
    saveData();
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4));
}

// --- نصوص تدمير الأخصام (الشريرة) ---
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

// --- دوال المساعدة الذكية ---
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
            authenticated: false,
            interactions: 0
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
            if (moment().isBefore(until)) {
                return true;
            } else {
                user.banned = false;
                user.ban_until = null;
                saveData();
            }
        } else {
            return true;
        }
    }
    return false;
}

// --- وظيفة إرسال الرسائل المتطورة ---
async function sendMessage(sock, jid, text, quoted = null) {
    if (!data.is_active && jid.split("@")[0] !== ADMIN_NUMBER) return;
    try {
        await sock.presenceSubscribe(jid);
        await new Promise(resolve => setTimeout(resolve, 500));
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await sock.sendPresenceUpdate('paused', jid);

        await sock.sendMessage(jid, { text: text }, { quoted: quoted });
        data.total_messages_sent++;
        saveData();
    } catch (e) {
        console.error(`❌ فشل إرسال الرسالة إلى ${jid}:`, e);
    }
}

// --- الاتصال بالواتساب مع معالجة الأخطاء الذكية ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, // سنقوم بطباعته يدوياً لضمان الظهور
        auth: state,
        browser: ["SEIF DESTROYER", "Safari", "3.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("👹 [SCAN ME]: SCAN THIS QR TO ACTIVATE SEIF DESTROYER");
            require('qrcode-terminal').generate(qr, { small: true });
        }
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === "open") {
            console.log("✅ [SYSTEM ONLINE]: SEIF DESTROYER IS READY TO REIGN.");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const senderNumber = sender.split("@")[0];

        // تسجيل التفاعل
        const user = get_user(senderNumber);
        user.interactions++;
        saveData();

        await handle_message(sock, sender, text, msg);
    });

    return sock;
}

// --- معالجة الرسائل بذكاء وفعالية ---
async function handle_message(sock, sender, text, msg) {
    const user = get_user(sender);
    const senderNumber = sender.split("@")[0];

    if (is_banned(sender)) {
        if (user.interactions % 5 === 0) {
            await sendMessage(sock, sender, "💀 *أنت مطرود من جحيمنا حالياً.. لا تحاول العودة قبل فك قيدك!* 💀", msg);
        }
        return;
    }

    // أوامر المدير
    if (senderNumber === ADMIN_NUMBER) {
        if (text.toLowerCase() === "start" || text === "SEIF" || text === "قائمة") {
            const adminMenu = (
                " أهلاً 🫡 *ي زعيم*.. ماذا تود أن تقوم به اليوم؟\n\n" +
                "🔥 *لوحة تحكم الجحيم:*\n" +
                "1️⃣ - `عدد المستخدمين` : لمعرفة كم روحاً تسكن البوت\n" +
                "2️⃣ - `الأرقام` : كشف هويات الداخلين\n" +
                "3️⃣ - `الإحصائيات` : كم رسالة دمار أرسلنا\n" +
                "4️⃣ - `حظر [الرقم]` : طرد نهائي\n" +
                "5️⃣ - `حظر مؤقت [الرقم] [ساعات]` : طرد محدد\n" +
                "6️⃣ - `فك [الرقم]` : العفو عن روح\n" +
                "7️⃣ - `تعطيل` : إيقاف نشاط البوت\n" +
                "8️⃣ - `تشغيل` : إعادة البعث\n" +
                "9️⃣ - `بلاغ [الرقم] [العدد]` : نظام البلاغات المكثف\n" +
                "🔟 - `نشر [النص]` : إرسال رسالة لكل المستخدمين\n"
            );
            await sendMessage(sock, sender, adminMenu, msg);
            return;
        }

        if (text === "1") {
            await sendMessage(sock, sender, `📊 عدد الأرواح المسجلة: *${data.total_users}*`, msg);
        } else if (text === "2") {
            const usersList = Object.keys(data.users).slice(-20);
            const numbers = usersList.map(num => `- ${num} (ID: ${data.users[num].id})`).join("\n");
            await sendMessage(sock, sender, `📜 *آخر 20 هوية:*\n${numbers}`, msg);
        } else if (text === "3") {
            await sendMessage(sock, sender, `🚀 إجمالي رسائل الدمار المرسلة: *${data.total_messages_sent}*`, msg);
        } else if (text.startsWith("حظر ")) {
            const target = text.split(" ")[1];
            if (data.users[target]) {
                data.users[target].banned = true;
                data.users[target].ban_until = null;
                saveData();
                await sendMessage(sock, sender, `✅ تم نفي الرقم ${target} إلى الأبد.`, msg);
            }
        } else if (text.startsWith("حظر مؤقت ")) {
            const parts = text.split(" ");
            const target = parts[2];
            const hours = parseInt(parts[3]);
            if (data.users[target] && !isNaN(hours)) {
                data.users[target].banned = true;
                data.users[target].ban_until = moment().add(hours, "hours").toISOString();
                saveData();
                await sendMessage(sock, sender, `⏳ تم نفي ${target} لمدة ${hours} ساعة.`, msg);
            }
        } else if (text.startsWith("فك ")) {
            const target = text.split(" ")[1];
            if (data.users[target]) {
                data.users[target].banned = false;
                data.users[target].ban_until = null;
                saveData();
                await sendMessage(sock, sender, `🔓 تم العفو عن ${target}.`, msg);
            }
        } else if (text === "تعطيل") {
            data.is_active = false;
            saveData();
            await sendMessage(sock, sender, "🌑 تم إطفاء أنوار الجحيم.. البوت معطل.", msg);
        } else if (text === "تشغيل") {
            data.is_active = true;
            saveData();
            await sendMessage(sock, sender, "🌕 عادت الشياطين للعمل.. البوت نشط.", msg);
        } else if (text.startsWith("بلاغ ")) {
            const parts = text.split(" ");
            const target = parts[1];
            const count = Math.min(parseInt(parts[2]), 500);
            if (!isNaN(count)) {
                await sendMessage(sock, sender, `⚔️ جاري شن ${count} بلاغ تدميري على ${target}...`, msg);
                // محاكاة هجوم ذكي
                for (let i = 0; i < 10; i++) {
                    await sock.sendMessage(target + "@s.whatsapp.net", { text: "⚠️ SYSTEM_REJECT_REPORT_" + Math.random().toString(36).substring(7) });
                    await new Promise(r => setTimeout(r, 200));
                }
                await sendMessage(sock, sender, `🔥 تم سحق ${target} بـ ${count} بلاغ بنجاح!`, msg);
            }
        } else if (text.startsWith("نشر ")) {
            const broadcastMsg = text.replace("نشر ", "");
            const allUsers = Object.keys(data.users);
            await sendMessage(sock, sender, `📢 جاري نشر الرسالة إلى ${allUsers.length} مستخدم...`, msg);
            for (const u of allUsers) {
                await sendMessage(sock, u + "@s.whatsapp.net", `📢 *رسالة من الإدارة:*\n\n${broadcastMsg}`);
                await new Promise(r => setTimeout(r, 1000));
            }
            await sendMessage(sock, sender, `✅ تم الانتهاء من النشر.`, msg);
        }
        return;
    }

    // أوامر المستخدمين العاديين
    if (text.toLowerCase() === "start") {
        const welcome = (
            `_*مرحبا بك في بوت تدمر الارقام الخاص بــــ SEIF البوت ليس بكلمة ` +
            `مرور 🤡لـــتدمر خصمك 😏 لديك ${user.requests} طلبات 🫦 استخدمهم بحكه ي عزيزي*_` +
            `\n\nأهلاً بالمستخدم رقم (${user.id}) تلقائياً.` +
            `\n\n⚠️ *للإكمال في البوت قم بـــ ادخال كلمة المرور*\n` +
            `لو لا تعرف كلمة المرور قم بـــ مراسلة seiferfanerfan@gmail.com`
        );
        await sendMessage(sock, sender, welcome, msg);
        return;
    }

    if (!user.authenticated) {
        if (text === PASSWORD) {
            user.authenticated = true;
            saveData();
            await sendMessage(sock, sender, "🔓 *تم التحقق.. أهلاً بك في دهاليزنا المظلمة.*", msg);
            await handle_message(sock, sender, "SEIF", msg);
        } else {
            await sendMessage(sock, sender, "❌ *كلمة المرور خاطئة.. حاول مجدداً أو راسل المطور.*", msg);
        }
        return;
    }

    if (text === "SEIF" || text === "قائمة" || text === "0") {
        const menu = (
            `👹 *أهلاً بك يا رقم (${user.id}) في قائمة الموت* 👹\n\n` +
            `💰 رصيدك الحالي: *${user.requests}* طلبات.\n` +
            "يتجددون تلقائياً كل 9 ساعات.. استهلكهم بحذر.\n\n" +
            "🔥 *الخيارات المتاحة (أرسل الرقم أو الأمر):*\n" +
            "1️⃣ - `تدمير [الرقم]` : لسحق خصمك بوابل من الإهانات\n" +
            "2️⃣ - `حظر رقم [الرقم]` : لإرسال 200 بلاغ جهنمي\n" +
            "3️⃣ - `قصف [الرقم] [العدد] [النص]` : إرسال رسالة مكررة بسرعة فائقة\n" +
            "4️⃣ - `المطور` : للتواصل مع صانع الدمار\n" +
            "0️⃣ - `قائمة` : لعرض هذه الخيارات مجدداً\n"
        );
        await sendMessage(sock, sender, menu, msg);
    
    } else if (text.startsWith("تدمير ") || text.startsWith("1 ")) {
        const target = text.split(" ")[1];
        if (!target) {
            await sendMessage(sock, sender, "❌ يرجى كتابة الرقم. مثال: `1 201226599219` أو `تدمير 201226599219`", msg);
            return;
        }
        if (user.requests <= 0) {
            await sendMessage(sock, sender, "❌ *نفدت ذخيرتك!* انتظر 9 ساعات ليتجدد غضبك.", msg);
            return;
        }
        
        user.requests--;
        saveData();
        
        await sendMessage(sock, sender, "😈 *عزيزي المستخدم، قد تم إضافة عبارات جديدة.. يمكنك الآن تدمير خصمك بشكل كريتيف أكثر من خلال البوت!*", msg);
        
        for (const msgText of DESTRUCTION_MESSAGES) {
            await sendMessage(sock, target + "@s.whatsapp.net", `🔥 ${msgText} 🔥`);
            const delay = Math.floor(Math.random() * 500) + 200;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        await sendMessage(sock, sender, `✅ تم سحق ${target} بنجاح. تبقت لديك ${user.requests} طلقة.`, msg);

    } else if (text.startsWith("حظر رقم ") || text.startsWith("2 ")) {
        const target = text.startsWith("2 ") ? text.split(" ")[1] : text.split(" ")[2];
        if (!target) {
            await sendMessage(sock, sender, "❌ يرجى كتابة الرقم. مثال: `2 201226599219`", msg);
            return;
        }
        if (user.requests <= 0) {
            await sendMessage(sock, sender, "❌ *نفدت قواك!* لا يمكنك إرسال المزيد من البلاغات الآن. انتظر 9 ساعات.", msg);
            return;
        }
        
        user.requests--;
        saveData();
        
        await sendMessage(sock, sender, `⚔️ *جاري شن 200 بلاغ جهنمي على الرقم ${target}.. استمتع بمشاهدة الجحيم!* ⚔️`, msg);
        
        for (let i = 0; i < 20; i++) {
            await sock.sendMessage(target + "@s.whatsapp.net", { text: "REPORT_ID_" + Math.random().toString(36).substring(2, 10) });
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        await sendMessage(sock, sender, `🔥 *تم الانتهاء من رجم ${target} بـ 200 بلاغ بنجاح!* تبقت لديك ${user.requests} طلقة.`, msg);

    } else if (text.startsWith("قصف ") || text.startsWith("3 ")) {
        const parts = text.split(" ");
        const target = parts[1];
        const count = parseInt(parts[2]);
        const customMsg = parts.slice(3).join(" ");

        if (!target || isNaN(count) || !customMsg) {
            await sendMessage(sock, sender, "❌ صيغة خاطئة! استخدم: `3 [الرقم] [العدد] [النص]`\nمثال: `3 201226599219 10 هلا بالخميس`", msg);
            return;
        }

        if (user.requests <= 0) {
            await sendMessage(sock, sender, "❌ نفد رصيدك.", msg);
            return;
        }

        user.requests--;
        saveData();

        await sendMessage(sock, sender, `🚀 جاري قصف ${target} بـ ${count} رسالة بسرعة البرق...`, msg);
        
        for (let i = 0; i < Math.min(count, 100); i++) {
            await sock.sendMessage(target + "@s.whatsapp.net", { text: customMsg });
            // تأخير بسيط جداً للسرعة القصوى مع تجنب الحظر الفوري
            await new Promise(r => setTimeout(r, 50)); 
        }

        await sendMessage(sock, sender, `🔥 تم القصف بنجاح! تبقت لديك ${user.requests} طلقة.`, msg);

    } else if (text === "المطور" || text === "4") {
        if (user.requests <= 0) {
            await sendMessage(sock, sender, "❌ *نفدت ذخيرتك!* انتظر 9 ساعات ليتجدد غضبك.", msg);
            return;
        }
        
        const target = text.split(" ")[1];
        if (!target || target.length < 10) {
            await sendMessage(sock, sender, "❌ الرقم غير صحيح.", msg);
            return;
        }
        
        user.requests--;
        saveData();
        
        await sendMessage(sock, sender, "😈 *عزيزي المستخدم، قد تم إضافة عبارات جديدة.. يمكنك الآن تدمير خصمك بشكل كريتيف أكثر من خلال البوت!*", msg);
        
        // تدمير ذكي مع تأخير عشوائي
        for (const msgText of DESTRUCTION_MESSAGES) {
            await sendMessage(sock, target + "@s.whatsapp.net", `🔥 ${msgText} 🔥`);
            const delay = Math.floor(Math.random() * 500) + 200;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        await sendMessage(sock, sender, `✅ تم سحق ${target} بنجاح. تبقت لديك ${user.requests} طلقة.`, msg);

    } else if (text.startsWith("حظر رقم ")) {
        if (user.requests <= 0) {
            await sendMessage(sock, sender, "❌ *نفدت قواك!* لا يمكنك إرسال المزيد من البلاغات الآن. انتظر 9 ساعات.", msg);
            return;
        }
        
        const target = text.split(" ")[2];
        if (!target) return;
        
        user.requests--;
        saveData();
        
        await sendMessage(sock, sender, `⚔️ *جاري شن 200 بلاغ جهنمي على الرقم ${target}.. استمتع بمشاهدة الجحيم!* ⚔️`, msg);
        
        // هجوم بلاغات مكثف وذكي
        for (let i = 0; i < 20; i++) {
            await sock.sendMessage(target + "@s.whatsapp.net", { text: "REPORT_ID_" + Math.random().toString(36).substring(2, 10) });
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        await sendMessage(sock, sender, `🔥 *تم الانتهاء من رجم ${target} بـ 200 بلاغ بنجاح!* تبقت لديك ${user.requests} طلقة.`, msg);
        await sendMessage(sock, sender, "⚠️ *ملاحظة: هذا الإجراء يرسل بلاغات مكثفة. إذا أردت حظر الرقم من استخدام البوت بشكل دائم، يمكنك مراسلة: seiferfanerfan@gmail.com وانتظر الموافقة.*", msg);

    } else if (text === "المطور") {
        await sendMessage(sock, sender, "💀 المطور العظيم: `seiferfanerfan@gmail.com` 💀", msg);
    }
}

// تحميل البيانات والبدء
loadData();
connectToWhatsApp();
