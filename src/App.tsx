import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  List,
  Moon,
  Sun,
  Brain,
  Microphone,
  ClipboardText,
  Lightbulb,
  Plus,
  X,
  ArrowUp,
  Lightning,
} from "@phosphor-icons/react";
import "./index.css";

interface AIRule {
  id: number;
  content: string;
}

interface ParsedData {
  category:
    | "Kepala Keluarga"
    | "ART Lainnya"
    | "Aset"
    | "Pengeluaran"
    | "Usaha";
  subCategory?: string;
  field: string;
  value: string | number;
  status: "Dari Catatan" | "Asumsi AI";
  reason?: string;
}

interface BudgetWarning {
  totalIncomePerMonth: number;
  estimatedExpensePerMonth: number;
  adjustments: string[];
}

interface ChatInteraction {
  id: string;
  rawText: string;
  parsedResults: ParsedData[];
  aiResponseText?: string;
  budgetWarning?: BudgetWarning;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  interactions: ChatInteraction[];
}

const API_KEY = import.meta.env.VITE_AI_API_KEY || '';

// ─── Utility: Parse "Rp 1.500.000" → 1500000 ───────────────────────────────
function parseRupiahToNumber(val: string | number): number {
  if (typeof val === "number") return val;
  const cleaned = String(val)
    .replace(/Rp\s*/gi, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

// ─── Post-Processing: Pastikan total pengeluaran ≤ 90% pendapatan ─────────────
//
//  Alur:
//  1. Hitung floor minimum = JML_ANGGOTA × Rp172.000/bln  &  × Rp375.000/thn
//  2. Potong Non Makanan Tahunan dulu (turun ke floor jika perlu)
//  3. Jika masih kurang, potong Non Makanan Bulanan (turun ke floor)
//  4. Jika masih kurang, naikkan gaji KK maks +Rp3.800.000/bln
//  5. Jika masih kurang (gaji terlalu kecil), biarkan + beri catatan
//
function enforceExpenseLimit(items: ParsedData[]): {
  items: ParsedData[];
  warning: BudgetWarning | undefined;
} {
  // ── 1. Hitung pendapatan bulanan ─────────────────────────────────────────────
  let totalIncomePerMonth = 0;
  let salaryItemField = "";
  for (const item of items) {
    const cat = item.category;
    const f = item.field.toLowerCase();
    if (cat === "Kepala Keluarga" || cat === "ART Lainnya") {
      if (f.includes("gaji") || f.includes("pendapatan") || f.includes("penghasilan")) {
        if (f.includes("setahun") || f.includes("tahunan")) {
          totalIncomePerMonth += parseRupiahToNumber(item.value) / 12;
        } else {
          totalIncomePerMonth += parseRupiahToNumber(item.value);
          if (!salaryItemField && cat === "Kepala Keluarga") salaryItemField = item.field;
        }
      }
    }
  }
  if (totalIncomePerMonth <= 0) return { items, warning: undefined };

  // ── 2. Hitung jumlah anggota keluarga ────────────────────────────────────────
  const artSubCats = new Set<string>();
  for (const item of items) {
    if (item.category === "ART Lainnya" && item.subCategory) {
      artSubCats.add(item.subCategory);
    }
  }
  const hasKK = items.some((i) => i.category === "Kepala Keluarga");
  const jmlAnggota = Math.max(1, (hasKK ? 1 : 0) + artSubCats.size);

  // ── 3. Ambil nilai pengeluaran ───────────────────────────────────────────────
  const getExp = (kw: string) =>
    items.find(
      (i) => i.category === "Pengeluaran" && i.field.toLowerCase().includes(kw.toLowerCase()),
    );

  const listrik    = parseRupiahToNumber(getExp("listrik")?.value ?? 0);
  const internet   = parseRupiahToNumber(getExp("internet")?.value ?? 0);
  const makanBiasa = parseRupiahToNumber(
    items.find(
      (i) => i.category === "Pengeluaran" &&
        i.field.toLowerCase().replace(/\s+/g, " ").includes("makanan mingguan") &&
        i.field.toLowerCase().includes("biasa")
    )?.value ?? 0
  ) * 4;
  const nonMakanBul = parseRupiahToNumber(getExp("non makanan bulanan")?.value ?? 0);
  const nonMakanTah = parseRupiahToNumber(getExp("non makanan tahunan")?.value ?? 0);
  const nonMakanTahPBl = nonMakanTah / 12;

  const fixedMonthly   = listrik + internet + makanBiasa;
  const estimatedExpense = fixedMonthly + nonMakanBul + nonMakanTahPBl;
  const target90       = totalIncomePerMonth * 0.9;

  if (estimatedExpense <= target90) return { items, warning: undefined };

  // ── 4. Floor minimum per anggota ────────────────────────────────────────────
  const RATE_BUL     = 172_000; // Rp/orang/bulan
  const RATE_TAH     = 375_000; // Rp/orang/tahun
  // FASIH validation: pengeluaran_non_makan_bulanan >= listrik + internet
  const floorBul     = Math.max(jmlAnggota * RATE_BUL, listrik + internet);
  const floorTah     = jmlAnggota * RATE_TAH;
  const floorTahPBl  = floorTah / 12;

  // ── 5. Potong tahunan dulu ke floor, lalu bulanan ke floor ──────────────────
  const kekurangan = estimatedExpense - target90;

  const potongTahPBl = Math.max(0, Math.min(nonMakanTahPBl - floorTahPBl, kekurangan));
  const newTahPBl    = nonMakanTahPBl - potongTahPBl;
  const sisa1        = kekurangan - potongTahPBl;

  const potongBul = Math.max(0, Math.min(nonMakanBul - floorBul, sisa1));
  const newBul    = nonMakanBul - potongBul;
  const sisa2     = sisa1 - potongBul;

  // ── 6. Naikkan gaji jika masih kurang (maks +Rp3.800.000) ───────────────────
  const MAX_BOOST   = 3_800_000;
  const incomeBoost = sisa2 > 0 ? Math.min(MAX_BOOST, sisa2 / 0.9) : 0;
  const effectiveIncome = totalIncomePerMonth + incomeBoost;

  // Apakah setelah semua koreksi masih belum seimbang?
  const sisaFinal = sisa2 - incomeBoost * 0.9;
  const stillUnbalanced = sisaFinal > 1; // toleransi Rp 1 untuk float

  const newNonMakanBul = Math.round(newBul);
  const newNonMakanTah = Math.round(newTahPBl * 12);

  // ── 7. Bangun catatan & update items ────────────────────────────────────────
  const adjustments: string[] = [];

  if (incomeBoost > 0) {
    adjustments.push(
      `Pendapatan KK dinaikkan +${formatRupiah(Math.round(incomeBoost))}/bln (maks. Rp 3.800.000) karena pemotongan pengeluaran tidak cukup`,
    );
  }

  if (stillUnbalanced) {
    adjustments.push(
      `⚠️ Catatan: Pengeluaran masih melebihi 90% pendapatan sebesar ${formatRupiah(Math.round(sisaFinal))}/bln ` +
      `(pendapatan terlalu kecil untuk diakali otomatis — perlu penanganan manual)`,
    );
  }

  const updatedItems = items.map((item) => {
    const cat = item.category;
    const f   = item.field.toLowerCase();

    // ✦ Naikkan gaji KK jika ada income boost
    if (incomeBoost > 0 && item.field === salaryItemField && cat === "Kepala Keluarga") {
      const oldVal = parseRupiahToNumber(item.value);
      const newVal = Math.round(oldVal + incomeBoost);
      adjustments.push(`"${item.field}": ${formatRupiah(oldVal)} → ${formatRupiah(newVal)}`);
      return {
        ...item,
        value: formatRupiah(newVal),
        status: "Asumsi AI" as const,
        reason: `Dinaikkan +${formatRupiah(Math.round(incomeBoost))}/bln (maks Rp 3.800.000) karena setelah potong pengeluaran ke nilai minimum (min. bulanan ${formatRupiah(floorBul)}/bln, min. tahunan ${formatRupiah(floorTah)}/thn) masih kurang.`,
      };
    }

    if (cat !== "Pengeluaran") return item;

    // ✦ Non Makanan Tahunan — dipotong pertama
    if (f.includes("non makanan tahunan") && newNonMakanTah !== nonMakanTah) {
      adjustments.push(
        `"${item.field}": ${formatRupiah(nonMakanTah)} → ${formatRupiah(newNonMakanTah)} ` +
        `(min. ${formatRupiah(floorTah)}/thn = ${jmlAnggota} org × Rp${RATE_TAH.toLocaleString("id-ID")})`,
      );
      return {
        ...item,
        value: formatRupiah(newNonMakanTah),
        status: "Asumsi AI" as const,
        reason:
          `Disesuaikan: pengeluaran melebihi 90% pendapatan. Tahunan dipotong terlebih dahulu. ` +
          `Minimum ${jmlAnggota} orang × Rp${RATE_TAH.toLocaleString("id-ID")}/thn = ${formatRupiah(floorTah)}.`,
      };
    }

    // ✦ Non Makanan Bulanan — dipotong setelah tahunan
    if (f.includes("non makanan bulanan") && newNonMakanBul !== nonMakanBul) {
      const floorBulDesc = floorBul > jmlAnggota * RATE_BUL
        ? `${formatRupiah(listrik + internet)} (listrik + internet)`
        : `${jmlAnggota} org × Rp${RATE_BUL.toLocaleString("id-ID")} = ${formatRupiah(jmlAnggota * RATE_BUL)}`;
      adjustments.push(
        `"${item.field}": ${formatRupiah(nonMakanBul)} → ${formatRupiah(newNonMakanBul)} ` +
        `(min. ${formatRupiah(floorBul)}/bln = ${floorBulDesc})`,
      );
      return {
        ...item,
        value: formatRupiah(newNonMakanBul),
        status: "Asumsi AI" as const,
        reason:
          `Disesuaikan: setelah tahunan dipotong masih melebihi 90% pendapatan. ` +
          `Bulanan dipotong. Minimum = ${formatRupiah(floorBul)}/bln (${floorBulDesc}).`,
      };
    }

    return item;
  });

  const correctedExpensePerMonth = fixedMonthly + newBul + newTahPBl;

  return {
    items: updatedItems,
    warning: {
      totalIncomePerMonth: effectiveIncome,
      estimatedExpensePerMonth: correctedExpensePerMonth,
      adjustments,
    },
  };
}

function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem("fasih_sessions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((s: Record<string, unknown>) => {
          if (s.interactions) return s;
          return {
            id: s.id,
            title: s.title,
            timestamp: s.timestamp,
            interactions: [
              {
                id: s.id,
                rawText: s.rawText || "",
                parsedResults: s.parsedResults || [],
                aiResponseText: s.aiResponseText || "",
              },
            ],
          };
        });
      } catch {
        return [];
      }
    }
    return [];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isListening, setIsListening] = useState(false);

  // AI Memory States
  const [aiRules, setAiRules] = useState<AIRule[]>([]);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [isSavingRule, setIsSavingRule] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("fasih_theme") as "light" | "dark") || "light";
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("fasih_theme", theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("ai_memory")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (data) setAiRules(data);
      } catch (err) {
        console.error("Error fetching AI rules:", err);
      }
    })();
  }, []);

  const saveRule = async () => {
    if (!newRuleText.trim()) return;
    setIsSavingRule(true);
    try {
      const { data, error } = await supabase
        .from("ai_memory")
        .insert([{ content: newRuleText }])
        .select();
      if (error) throw error;
      if (data) setAiRules((prev) => [...prev, data[0]]);
      setNewRuleText("");
      setShowRuleModal(false);
    } catch (err) {
      console.error("Error saving rule:", err);
      alert("Gagal menyimpan aturan ke database.");
    } finally {
      setIsSavingRule(false);
    }
  };

  useEffect(() => {
    localStorage.setItem("fasih_sessions", JSON.stringify(sessions));
  }, [sessions]);

  // Hapus useEffect yang agresif auto-select session pertama saat null

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  };

  const createNewSession = () => {
    setActiveSessionId(null);
    setInputText("");
    setErrorMsg("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const toggleListening = () => {
    interface ISpeechRecognition {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onstart: (() => void) | null;
      onresult: ((event: SpeechRecognitionEvent) => void) | null;
      onend: (() => void) | null;
      onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
      start(): void;
      stop(): void;
    }
    interface ISpeechRecognitionConstructor {
      new (): ISpeechRecognition;
    }
    interface WindowWithSpeech {
      SpeechRecognition?: ISpeechRecognitionConstructor;
      webkitSpeechRecognition?: ISpeechRecognitionConstructor;
    }
    const win = window as WindowWithSpeech;
    const SpeechRecognitionAPI =
      win.SpeechRecognition || win.webkitSpeechRecognition;
    const SpeechRecognition = SpeechRecognitionAPI;

    if (!SpeechRecognition) {
      alert(
        "Browser Anda tidak mendukung fitur Suara ke Teks. Coba gunakan Google Chrome.",
      );
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "id-ID";
    recognition.continuous = true;
    recognition.interimResults = true;

    let startText = inputText;

    recognition.onstart = () => {
      setIsListening(true);
      startText = inputText;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let currentTranscript = "";
      for (let i = 0; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      setInputText(
        startText +
          (startText && currentTranscript ? " " : "") +
          currentTranscript,
      );
      setTimeout(adjustTextareaHeight, 0);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  const processText = async () => {
    if (!inputText.trim()) return;

    setIsProcessing(true);
    setErrorMsg("");
    const targetSessionId = activeSessionId;

    const currentInput = inputText;
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const systemPrompt = `
Kamu adalah asisten ahli pengolah data untuk survei FASIH BPS.
Tugasmu mengekstrak informasi dari catatan wawancara lapangan ke JSON.

ATURAN UTAMA:
1. Ekstrak informasi eksplisit, dan isi kekosongan data umum dengan ASUMSI logis.
2. "status" harus berisi "Dari Catatan" atau "Asumsi AI".
3. Kategori wajib: "Kepala Keluarga", "ART Lainnya", "Aset", "Pengeluaran", "Usaha".
4. KHUSUS KATEGORI "ART Lainnya": Kamu WAJIB menyertakan field "subCategory" (contoh: "Istri", "Anak Pertama", "Anak Kedua") agar data tiap orang terpisah.
5. KHUSUS KATEGORI "Aset": JANGAN pisahkan jumlah dan harga. Gabungkan dalam bentuk Teks (contoh value: "2 Unit = Rp 30.000.000").
   Aturan Asumsi Aset khusus:
   - Tanah/Lahan: Wajib pakai patokan Rp 80.000.000 per 1 Are. (Misal punya 3 Are -> "3 Are = Rp 240.000.000").
   - Motor: Asumsi Rp 15.000.000 per unit.
   - Mobil: Asumsi Rp 150.000.000 per unit (atau tebak wajar).
   - Emas/Perhiasan: Cukup berikan jumlah gram (TIDAK perlu nominal rupiahnya, misal: "10 gram").
   - Tabung Gas: Pisahkan jenis "Gas 3kg" dan "Gas >5.5kg/12kg". Value harus berupa TOTAL UNIT/TABUNG, BUKAN jumlah kg (Contoh field: "Gas 3kg", value: "2 Tabung/Unit").
6. KHUSUS KATEGORI "Usaha":
   - Produksi, Pendapatan, dan Pengeluaran WAJIB dihitung untuk 1 TAHUN (12 bulan). Jika di catatan disebutkan per bulan/minggu, KALIKAN agar menjadi setahun.
   - Jika ada rentang nilai rata-rata (contoh: pendapatan 2-4 juta), AMBIL NILAI TENGAHNYA (3 juta).
   - PASTIKAN Total Modal/Pengeluaran (produksi, buruh, dll) TIDAK BOLEH LEBIH BESAR dari Pendapatan. Jika terjadi kerugian, AKALI dengan membuat nilai Pendapatan menjadi 50% LEBIH BESAR dari Total Modal.
7. FORMAT UANG: SEMUA nominal uang (gaji, tagihan, pendapatan, modal, dll) HARUS ditulis dalam bentuk Teks dengan awalan "Rp " dan pemisah titik (contoh: "Rp 1.500.000"). Jangan gunakan tipe angka murni untuk uang!
148: 8. KODE PEKERJAAN: Jika mencatat Pekerjaan untuk Kepala Keluarga atau ART Lainnya, WAJIB sertakan baris baru dengan field "Kode Pekerjaan" yang nilainya dicocokkan dari daftar berikut:
149:    0. Tidak Bekerja, 001. Agen Tenaga Kerja, 002. Ahli Sejarah dan Cagar budaya, 003. Akuntan, 004. Analis Keuangan, 005. Anggota DPD, 006. Anggota DPR RI/MPR RI, 007. Anggota DPRD Provinsi/ Anggota DPRD Kabupaten/Kota, 008. Apoteker, 009. Arsiparis, 010. Arsitek, 011. Asisten Apoteker, 012. Atase, 013. Atlet/Olahragawan, 014. Awak Kapal, 015. Bhikkhu, 016. Biarawan, 017. Biarawati, 018. Bidan, 019. Broker/Pialang Saham, 020. Bupati, 021. Buruh Angkut Barang, 022. Buruh Bangunan, 023. Buruh Industri, 024. Buruh Perikanan, 025. Buruh Pertambangan, 026. Buruh Pertanian/Kehutanan, 027. Buruh Peternakan, 028. Camat, 029. Chef, 030. Chief Executive Officer (CEO), 031. Dokter Gigi, 032. Dokter Hewan, 033. Dokter Spesialis, 034. Dokter Umum, 035. Dosen, 036. Duta Besar, 037. Empu Keris, 038. Fotografer, 039. Gembala, 040. Gubernur, 041. Guru, 042. Hakim, 043. Hakim Agung, 044. Imam Masjid, 045. Jaksa, 046. Jaksa Agung, 047. Jiaosheng, 048. Juru Gambar Teknik/Drafter, 049. Kameramen, 050. Kapten Kapal, 051. Kasir, 052. Kepala Desa, 053. Ketua Adat, 054. Ketua Organisasi, 055. Konsultan, 056. Kreator Konten, 057. Kurator, 058. Kurir, 059. Lurah, 060. Makelar, 061. Manajer, 062. Masinis, 063. Mekanik, 064. Menteri/Kepala Badan (setingkat Menteri)/ Wakil Menteri/Wakil Kepala Badan, 065. Nakhoda, 066. Nelayan, 067. Notaris, 068. Operator Layanan Pelanggan (Customer Service), 069. Operator Mesin, 070. Pandita, 071. Panitera Pengadilan, 072. Paraji, 073. Paranormal, 074. Pastor, 075. Pedagang, 076. Pedagang Asongan/Keliling Makanan, 077. Pedagang Asongan/Keliling Nonmakanan, 078. Pedagang Online, 079. Pegawai Pemerintah dengan Perjanjian Kerja (PPPK), 080. Pekerja Garmen/Konveksi, 081. Pekerja Percetakan, 082. Pekerja Profesional Penjualan (agen asuransi, sales penjualan, dll), 083. Pekerja Sosial, 084. Pelaku Ekosistem Musik, 085. Pelaku Ekosistem Perfilman, 086. Pelaku Ekosistem Seni Pertunjukan, 087. Pelaku Ekosistem Seni Rupa dan Kriya, 088. Pelatih/ Instruktur Olahraga, 089. Pelayan Toko, 090. Pembantu/Asisten Rumah Tangga, 091. Pemberi Pinjaman, 092. Pembuat Makanan/Juru Masak, 093. Pembuat Minuman (Barista, Bartender, dll), 094. Pembuat Rokok/Cerutu/Tembakau Gulung, 095. Pembuat Sepatu dan Tas, 096. Pembudi Daya Ikan dan Biota Air Lainnya, 097. Pemulung, 098. Penagih Hutang (Debt Collector), 099. Penasihat Spiritual, 100. Penata Busana, 101. Penata Rambut, 102. Penata Rias, 103. Penata Suara, 104. Pendeta, 105. Peneliti, 106. Penerjemah, 107. Pengacara, 108. Pengasuh Anak (Baby Sitter), 109. Pengelola Gedung/Properti, 110. Pengemudi Ojek Online, 111. Pengemudi Ojek Pangkalan, 112. Pengepul, 113. Penjaga Keamanan/Satpam, 114. Penjahit, 115. Penulis, 116. Penyelenggara Acara (Event Organizer/EO), 117. Penyiar Radio, 118. Penyiar Televisi, 119. Perajin Batu, 120. Perajin Kayu, Bambu, dan Anyaman, 121. Perajin Kulit dan Tekstil, 122. Perajin Logam, 123. Perajin Perhiasan, 124. Perajin Tembikar/Keramik, 125. Peramal, 126. Perancang Busana/Desainer, 127. Perangkat Desa, 128. Perawat, 129. Petani/Pekebun/Petani Hutan, 130. Peternak, 131. Petugas Pemadam Kebakaran, 132. Petugas Stasiun Pengisian Bahan Bakar, 133. Pilot, 134. Pinandita, 135. PNS Fungsional Tertentu, 136. PNS Fungsional Umum, 137. PNS_Struktural, 138. Polisi, 139. Pramugara/i, 140. Pramusaji, 141. Presiden, 142. Programer, 143. Psikiater, 144. Psikolog, 145. Pustakawan, 146. Resepsionis, 147. Sekretaris, 148. Seniman/Artis, 149. Sopir, 150. Supervisor/Mandor, 151. Tabib, 152. Teknisi, 153. Teller Bank, 154. Tenaga Cuci, 155. Tenaga Humas, 156. Tenaga Kebersihan, 157. Tenaga Tata Usaha, 158. Tentara Nasional Indonesia (TNI), 159. Tukang Bangunan, 160. Tukang Cat, 161. Tukang Cukur, 162. Tukang Fotokopi, 163. Tukang Gigi, 164. Tukang Kaca, 165. Tukang Kayu, 166. Tukang Kunci, 167. Tukang Las/Pandai Besi, 168. Tukang Listrik, 169. Tukang Pijat, 170. Tukang Pipa, 171. Tukang Sablon, 172. Tukang Sol Sepatu, 173. Tukang Tambal Ban, 174. Tukang Tebang Kayu, 175. Uskup, 176. Ustaz/Mubalig, 177. Wakil Bupati, 178. Wakil Gubernur, 179. Wakil Presiden, 180. Wakil Walikota, 181. Walikota, 182. Wartawan, 183. Wenshi, 184. Xueshi, 185. Lainnya, 999. Tidak Tahu.
150:    Pilih satu yang paling cocok! (Contoh field: "Kode Pekerjaan", value: "041. Guru").
151: 9. PENDAPATAN USAHA ART: Untuk kategori "Kepala Keluarga" maupun "ART Lainnya", JIKA disebutkan orang tersebut memiliki usaha dan ada detail pendapatannya, WAJIB tambahkan field "Pendapatan dari Usaha Sebulan" yang berisi nominal total pendapatan usahanya selama 1 bulan.
152: 10. ATURAN PERHITUNGAN PENGELUARAN OTOMATIS (SANGAT PENTING):
   1. VARIABEL INPUT (Hasil Ekstraksi LLM Wawancara)
   Sebelum masuk ke rumus, kamu harus mengekstrak 4 variabel angka ini dari teks wawancara:
   - JML_ANGGOTA (Jumlah Anggota Keluarga)
   - JML_MOTOR (Jumlah Kendaraan Motor)
   - JML_MOBIL (Jumlah Kendaraan Mobil)
   - JML_GAS (Jumlah Tabung Gas per bulan)

   2. LOGIKA PERHITUNGAN BULANAN (IF - MAKA)
   A. Biaya dari data memang bawaan hasil wawancara, ditambahkan saja ke pengeluaran bulannya(Base Cost)
      IF Rumah tangga aktif/terdata, (Mencakup: Listrik dasar dan internet rumahl).
   B. Berdasarkan Anggota Keluarga
      IF JML_ANGGOTA > 0,
      MAKA:
      - Biaya_Air_Sabun = JML_ANGGOTA * Rp 25.000
      - Biaya_Pulsa_HP = JML_ANGGOTA * Rp 35.000
      - Biaya_BPJS = JML_ANGGOTA * Rp 42.000
      - Biaya_Kebutuhan_Harian (Tisu, pampers, dll) = JML_ANGGOTA * Rp 50.000
      - Biaya_Kesehatan_Rutin (Obat/kontrol) = JML_ANGGOTA * Rp 20.000
      ELSE (Jika data kosong/0),
      MAKA Semua sub-total di atas = 0
   C. Berdasarkan Kendaraan
      IF JML_MOTOR > 0,
      MAKA Bensin_Motor_Bulanan = JML_MOTOR * Rp 150.000
      ELSE,
      MAKA Bensin_Motor_Bulanan = 0
      IF JML_MOBIL > 0,
      MAKA Bensin_Mobil_Bulanan = JML_MOBIL * Rp 1.000.000
      ELSE,
      MAKA Bensin_Mobil_Bulanan = 0
   D. Berdasarkan Dapur/Gas
      IF JML_GAS > 0,
      MAKA Biaya_Gas_Bulanan = JML_GAS * Rp 22.000
      ELSE,
      MAKA Biaya_Gas_Bulanan = 0

   3. LOGIKA PERHITUNGAN TAHUNAN (IF - MAKA)
   A. Biaya Tetap Rumah Tangga (Base Cost)
      IF Rumah tangga aktif/terdata,
      MAKA Biaya_Tetap_Tahunan = Rp 300.000
      (Mencakup: PBB/Pajak rumah, perawatan rumah berkala, subscription tahunan).
   B. Berdasarkan Anggota Keluarga
      IF JML_ANGGOTA > 0,
      MAKA:
      - Biaya_Grooming (Pangkas rambut/kosmetik) = JML_ANGGOTA * Rp 25.000
      - Biaya_Hari_Raya  = JML_ANGGOTA * Rp 25.000
      - Biaya_Pendidikan_Berkala (Alat sekolah/semesteran) = JML_ANGGOTA (jika anggota masih pendidikan) * Rp 250.000
      - Biaya_Kesehatan_Tahunan = JML_ANGGOTA * Rp 100.000
      ELSE,
      MAKA Semua sub-total di atas = 0
   C. Berdasarkan Kendaraan
      IF JML_MOTOR > 0,
      MAKA Perawatan_Motor_Tahunan = JML_MOTOR * Rp 900.000
      (Akumulasi Pajak Samsat Rp 300.000 + Servis & Oli Setahun Rp 600.000)
      ELSE,
      MAKA Perawatan_Motor_Tahunan = 0
      IF JML_MOBIL > 0,
      MAKA Perawatan_Mobil_Tahunan = JML_MOBIL * Rp 5.500.000
      (Akumulasi Pajak Samsat Rp 1.500.000 + Servis & Oli Setahun Rp 1.500.000)
      ELSE,
      MAKA Perawatan_Mobil_Tahunan = 0.

   BERDASARKAN LOGIKA DI ATAS, khusus untuk KATEGORI "Pengeluaran", CUKUP BERIKAN OUTPUT BERIKUT SEBAGAI HASIL AKHIR (Gabungkan rincian di atas):
   1. "Biaya Listrik Bulanan" (Sesuai catatan atau Asumsi AI)
   2. "Biaya Internet Bulanan" (Sesuai catatan atau Asumsi AI)
   3. "Biaya Makanan Mingguan (Biasa)": JML_ANGGOTA * Rp 20.000 * 7 hari (Rp 140.000 / orang / minggu).
   4. "Biaya Makanan Mingguan (Kaya)": JML_ANGGOTA * Rp 30.000 * 7 hari (Rp 210.000 / orang / minggu).
      (Selalu keluarkan KEDUA versi makanan ini).
   5. "Non Makanan Bulanan Total": Total dari seluruh hitungan "2. LOGIKA PERHITUNGAN BULANAN" saja (Air/Sabun, Pulsa, BPJS, Kebutuhan Harian, Kesehatan Rutin, Bensin, Gas).
   6. "Non Makanan Tahunan Total": Total dari seluruh hitungan "3. LOGIKA PERHITUNGAN TAHUNAN" murni (Biaya Tetap, Grooming, Hari Raya, Pendidikan, Kesehatan Tahunan, Perawatan Kendaraan).

   PENTING: Pengeluaran tahunan HANYA berisi hasil perhitungan dari Logika Tahunan saja. JANGAN menambahkan/mengalikan pengeluaran bulanan ke dalamnya! Masukkan ke-6 hasil akhir ini saja ke dalam array JSON dengan "category": "Pengeluaran".

   ATURAN BATAS PENGELUARAN — LANGKAH KALKULASI WAJIB (LAKUKAN SEBELUM OUTPUT):
   LANGKAH 1 — Hitung TOTAL_PENDAPATAN_BULANAN:
     Jumlahkan semua gaji/penghasilan bulanan dari Kepala Keluarga + seluruh ART Lainnya.
     Contoh: KK gaji Rp 1.200.000 + Istri Rp 500.000 → TOTAL = Rp 1.700.000

   LANGKAH 2 — Hitung ESTIMASI_PENGELUARAN_BULANAN:
     = Biaya_Listrik + Biaya_Internet + (Biaya_Makanan_Mingguan_Biasa × 4) + Non_Makanan_Bulanan_Total + (Non_Makanan_Tahunan_Total ÷ 12)
     Contoh: 100.000 + 100.000 + (140.000×4) + 344.000 + (600.000÷12) = Rp 1.154.000

   LANGKAH 3 — Bandingkan dan Seimbangkan:
     Jika ESTIMASI_PENGELUARAN_BULANAN > TOTAL_PENDAPATAN_BULANAN × 90%:
     → TARGET = TOTAL_PENDAPATAN_BULANAN × 90%
     → KEKURANGAN = ESTIMASI - TARGET
     → URUTAN KOREKSI (MAKANAN & LISTRIK & INTERNET TIDAK BOLEH DIUBAH):
        LANGKAH A — Potong "Non Makanan Tahunan Total" terlebih dahulu:
           • Floor minimum = JML_ANGGOTA × Rp 375.000/tahun (TIDAK boleh di bawah ini).
           • Potong semaksimal mungkin hingga floor minimum tersebut.
           • Jika kekurangan sudah tertutup → STOP, tidak perlu lanjut.
        LANGKAH B — Jika masih kurang, potong "Non Makanan Bulanan Total":
           • Floor minimum = max(JML_ANGGOTA × Rp 172.000/bulan, Biaya_Listrik + Biaya_Internet).
           • Potong semaksimal mungkin hingga floor minimum tersebut.
           • Jika kekurangan sudah tertutup → STOP.
        LANGKAH C — Jika masih kurang setelah potong maksimal:
           • Naikkan pendapatan (gaji Kepala Keluarga) maksimal +Rp 3.800.000/bln.
           • Catat di field "reason": "Pendapatan dinaikkan karena pemotongan pengeluaran tidak mencukupi."
        PENTING:
           • "Non Makanan Tahunan" dan "Non Makanan Bulanan" TIDAK BOLEH menjadi Rp 0.
           • Nilai minimal masing-masing = floor minimum seperti di atas.
           • ATURAN FLOOR TAMBAHAN: Nilai "Non Makanan Bulanan" setelah dipotong TIDAK BOLEH lebih kecil dari (Biaya_Listrik + Biaya_Internet).
           • Tambahkan field "reason" pada setiap item yang diubah.

   PENTING: Jika TOTAL_PENDAPATAN_BULANAN tidak diketahui dari catatan (tidak disebutkan gaji sama sekali), SKIP langkah ini dan gunakan nilai default rumus biasa.


Keluarkan HANYA array JSON tanpa format markdown:
[
  {
    "category": "Usaha",
    "field": "Pendapatan Setahun",
    "value": "Rp 24.000.000",
    "status": "Asumsi AI",
    "reason": "Dihitung 12 bulan x Rp 2.000.000 (nilai tengah rata-rata)"
  }
]

${
  aiRules.length > 0
    ? `ATURAN TAMBAHAN DARI PENGALAMAN (SANGAT PENTING - OVERRIDE ATURAN LAMA JIKA BENTROK):
${aiRules.map((r, i) => `${i + 1}. ${r.content}`).join("\n")}
`
    : ""
}
`;

      const response = await fetch(
        "https://dwidarmawanjpg-9router.hf.space/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: "combotry",
            messages: (function () {
              const msgs = [{ role: "system", content: systemPrompt }];
              const targetSession = sessions.find(
                (s) => s.id === targetSessionId,
              );
              if (targetSession) {
                for (const ix of targetSession.interactions) {
                  msgs.push({
                    role: "user",
                    content: 'Teks wawancara:\n"""\n' + ix.rawText + '\n"""',
                  });
                  const asstContent =
                    (ix.parsedResults.length > 0
                      ? JSON.stringify(ix.parsedResults)
                      : "") +
                    (ix.aiResponseText ? "\n\n" + ix.aiResponseText : "");
                  msgs.push({
                    role: "assistant",
                    content: asstContent.trim() || "{}",
                  });
                }
              }
              msgs.push({
                role: "user",
                content: 'Teks wawancara:\n"""\n' + currentInput + '\n"""',
              });
              return msgs;
            })(),
            temperature: 0.3,
            stream: false,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const rawTextResponse = await response.text();
      let text = "";

      if (rawTextResponse.includes("data: {")) {
        const lines = rawTextResponse.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.replace("data: ", ""));
              if (data.choices?.[0]?.delta?.content) {
                text += data.choices[0].delta.content;
              } else if (data.choices?.[0]?.message?.content) {
                text = data.choices[0].message.content;
              }
            } catch {
              /* ignore JSON parse errors for SSE lines */
            }
          }
        }
      } else {
        try {
          const result = JSON.parse(rawTextResponse);
          text = result.choices[0].message.content;
        } catch {
          text = rawTextResponse;
        }
      }

      text = text.trim();

      let parsedJson: ParsedData[] = [];
      let finalAiResponseText = "";

      let textToParse = text;
      if (textToParse.startsWith("```json")) {
        textToParse = textToParse
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (textToParse.startsWith("```")) {
        textToParse = textToParse.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      try {
        parsedJson = JSON.parse(textToParse) as ParsedData[];
      } catch {
        try {
          const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (match) {
            parsedJson = JSON.parse(match[0]) as ParsedData[];
            finalAiResponseText = text
              .replace(match[0], "")
              .replace(/```json/gi, "")
              .replace(/```/g, "")
              .trim();
          } else {
            finalAiResponseText = text;
          }
        } catch {
          finalAiResponseText = text;
        }
      }

      if (parsedJson.length === 0 && !finalAiResponseText) {
        finalAiResponseText = text;
      }

      // ── Post-processing: enforce expense ≤ income ──────────────────────────
      const { items: correctedJson, warning: budgetWarning } =
        enforceExpenseLimit(parsedJson);

      const newInteraction: ChatInteraction = {
        id: Date.now().toString(),
        rawText: currentInput,
        parsedResults: correctedJson,
        aiResponseText: finalAiResponseText,
        budgetWarning,
      };

      if (targetSessionId) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === targetSessionId) {
              return {
                ...s,
                interactions: [...s.interactions, newInteraction],
              };
            }
            return s;
          }),
        );
      } else {
        const newSession: ChatSession = {
          id: Date.now().toString(),
          title:
            currentInput.slice(0, 30) + (currentInput.length > 30 ? "..." : ""),
          timestamp: Date.now(),
          interactions: [newInteraction],
        };
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
      }

      setTimeout(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(
        "Gagal memproses. Coba lagi. " +
          (err instanceof Error ? err.message : String(err)),
      );
      setInputText(currentInput);
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter((s) => s.id !== id);
    setSessions(newSessions);
    if (activeSessionId === id) {
      setActiveSessionId(newSessions.length > 0 ? newSessions[0].id : null);
    }
  };

  const isCurrency = (field: string) => {
    const lower = field.toLowerCase();
    return (
      lower.includes("gaji") ||
      lower.includes("biaya") ||
      lower.includes("pengeluaran") ||
      lower.includes("harga") ||
      lower.includes("pendapatan") ||
      lower.includes("tagihan") ||
      lower.includes("nominal") ||
      lower.includes("nilai") ||
      lower.includes("omzet")
    );
  };

  const formatValue = (item: ParsedData) => {
    if (typeof item.value === "number") {
      if (isCurrency(item.field)) {
        return `Rp ${item.value.toLocaleString("id-ID")}`;
      }
      return item.value.toLocaleString("id-ID");
    }
    return item.value;
  };

  const categoryOrder = [
    "Kepala Keluarga",
    "ART Lainnya",
    "Usaha",
    "Aset",
    "Pengeluaran",
  ];

  return (
    <div className="layout-container">
      {/* Mobile Overlay */}
      <div
        className={`mobile-overlay ${isSidebarOpen ? "open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar History */}
      <aside
        className={`sidebar ${isSidebarOpen ? "open" : ""}`}
        aria-label="Riwayat Obrolan"
      >
        {/* Brand strip */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark" aria-hidden="true">
            <Lightning size={16} weight="fill" />
          </div>
          <div>
            <div className="sidebar-logo-name">FASIH</div>
            <span className="sidebar-logo-sub">AI Assistant</span>
          </div>
        </div>

        {/* Primary action */}
        <button
          className="btn-new-extraction"
          onClick={() => {
            createNewSession();
            setIsSidebarOpen(false);
          }}
          aria-label="Buat ekstraksi baru"
        >
          <Plus size={16} weight="bold" /> Ekstraksi Baru
        </button>

        {/* Secondary action */}
        <button
          className="btn-ai-memory"
          onClick={() => {
            setShowRuleModal(true);
            setIsSidebarOpen(false);
          }}
          aria-label="Ajari AI"
        >
          <Brain size={16} /> Ajari AI
          <span className="rule-count">{aiRules.length}</span>
        </button>

        <div className="sidebar-section-label">Riwayat</div>

        <div className="history-list modern-scrollbar">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`history-item ${activeSessionId === session.id ? "active" : ""}`}
              onClick={() => {
                setActiveSessionId(session.id);
                setIsSidebarOpen(false);
              }}
            >
              <div className="history-text">
                <div className="history-title">{session.title}</div>
                <div className="history-date">
                  {new Date(session.timestamp).toLocaleDateString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => deleteSession(session.id, e)}
                aria-label="Hapus sesi"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="history-empty">Belum ada riwayat ekstraksi.</div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="top-bar">
          <button
            className="menu-btn"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Buka Menu"
          >
            <List size={18} />
          </button>

          <div className="top-bar-center">
            <span className="top-bar-brand">FASIH</span>
            {activeSession && (
              <>
                <span className="top-bar-sep" aria-hidden="true" />
                <span className="top-bar-session">{activeSession.title}</span>
              </>
            )}
          </div>

          <button
            className="theme-btn"
            onClick={() =>
              setTheme((prev) => (prev === "light" ? "dark" : "light"))
            }
            aria-label="Ganti Tema"
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </div>

        <div className="results-scroll-area modern-scrollbar">
          {activeSession ? (
            <div className="session-view">
              {activeSession.interactions.map((ix) => {
                const groupedResults =
                  ix.parsedResults.reduce(
                    (acc, curr) => {
                      if (!acc[curr.category]) acc[curr.category] = [];
                      acc[curr.category].push(curr);
                      return acc;
                    },
                    {} as Record<string, ParsedData[]>,
                  ) || {};

                return (
                  <div key={ix.id} className="interaction-wrapper">
                    <div className="user-message-bubble">
                      <div className="bubble-label">Catatan Lapangan</div>
                      <div className="bubble-text">{ix.rawText}</div>
                    </div>

                    <div className="ai-response-container">
                      {/* ── Budget Warning Banner ── */}
                      {ix.budgetWarning && (
                        <div className="budget-warning-banner" role="alert">
                          <div className="budget-warning-header">
                            <span
                              className="budget-warning-icon"
                              aria-hidden="true"
                            >
                              ⚠️
                            </span>
                            <strong>
                              Pengeluaran Melebihi Pendapatan — Otomatis
                              Dikoreksi
                            </strong>
                          </div>
                          <div className="budget-warning-body">
                            <div className="budget-warning-row">
                              <span>Total Pendapatan Bulanan ART:</span>
                              <span className="budget-income">
                                {formatRupiah(
                                  ix.budgetWarning.totalIncomePerMonth,
                                )}
                              </span>
                            </div>
                            <div className="budget-warning-row">
                              <span>
                                Estimasi Pengeluaran (sebelum koreksi):
                              </span>
                              <span className="budget-expense">
                                {formatRupiah(
                                  ix.budgetWarning.estimatedExpensePerMonth,
                                )}
                              </span>
                            </div>
                            <div className="budget-warning-row budget-warning-selisih">
                              <span>Selisih Minus:</span>
                              <span className="budget-minus">
                                −
                                {formatRupiah(
                                  ix.budgetWarning.estimatedExpensePerMonth -
                                    ix.budgetWarning.totalIncomePerMonth,
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="budget-warning-note">
                            Nilai berikut telah disesuaikan secara otomatis agar
                            tidak melebihi 90% pendapatan:
                            <ul className="budget-adj-list">
                              {ix.budgetWarning.adjustments.map((adj, i) => (
                                <li key={i}>{adj}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      <div className="ai-response-header">
                        <div className="bubble-label">Hasil Ekstraksi</div>
                        <button
                          className="copy-btn"
                          onClick={() => {
                            const text = ix.parsedResults
                              .map(
                                (r) => `${r.category} | ${r.field}: ${r.value}`,
                              )
                              .join("\n");
                            navigator.clipboard.writeText(text);
                            alert("Berhasil disalin!");
                          }}
                        >
                          <ClipboardText size={13} /> Salin
                        </button>
                      </div>

                      <div className="wide-results-grid">
                        {categoryOrder.map((cat) => {
                          const items =
                            groupedResults[cat] ||
                            groupedResults[cat.toUpperCase()] ||
                            [];
                          if (items.length === 0) return null;

                          return (
                            <div key={cat} className="wide-category-section">
                              <h3 className="category-title">{cat}</h3>
                              {(() => {
                                const subCats = Array.from(
                                  new Set(
                                    items.map((i) => i.subCategory || ""),
                                  ),
                                );

                                return subCats.map((sub, subIdx) => {
                                  const subItems = items.filter(
                                    (i) => (i.subCategory || "") === sub,
                                  );
                                  return (
                                    <div
                                      key={subIdx}
                                      className="subcategory-group"
                                    >
                                      {sub && (
                                        <h4 className="subcategory-title">
                                          {sub}
                                        </h4>
                                      )}
                                      <div className="horizontal-grid">
                                        {subItems.map((res, i) => (
                                          <div key={i} className="data-card">
                                            <div className="data-card-header">
                                              <span className="data-field">
                                                {res.field}
                                              </span>
                                              <span
                                                className={`status-dot ${res.status === "Asumsi AI" ? "dot-asumsi" : "dot-real"}`}
                                                title={res.status}
                                              ></span>
                                            </div>
                                            <div
                                              className={`data-value ${isCurrency(res.field) || String(res.value).includes("Rp") ? "is-currency" : ""}`}
                                            >
                                              {formatValue(res)}
                                            </div>
                                            {res.reason && (
                                              <div className="data-reason">
                                                <span className="reason-icon">
                                                  <Lightbulb
                                                    size={11}
                                                    weight="fill"
                                                  />
                                                </span>{" "}
                                                {res.reason}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          );
                        })}
                      </div>

                      {ix.aiResponseText && (
                        <div className="plain-text-response">
                          <div className="bubble-label">
                            Pesan / Jawaban Teks
                          </div>
                          <div className="plain-text-body">
                            {ix.aiResponseText}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isProcessing && activeSessionId === activeSession.id && (
                <div
                  className="loading-container"
                  style={{ marginTop: "2rem" }}
                >
                  <div className="skeleton-bubble user"></div>
                  <div className="skeleton-bubble ai">
                    <div className="skeleton-pulse-text"></div>
                    <div className="skeleton-grid">
                      <div className="skeleton-card"></div>
                      <div className="skeleton-card"></div>
                      <div className="skeleton-card"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : isProcessing ? (
            <div className="loading-container">
              <div className="skeleton-bubble user"></div>
              <div className="skeleton-bubble ai">
                <div className="skeleton-pulse-text"></div>
                <div className="skeleton-grid">
                  <div className="skeleton-card"></div>
                  <div className="skeleton-card"></div>
                  <div className="skeleton-card"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="welcome-screen">
              <div className="welcome-mark" aria-hidden="true">
                <Lightning size={26} weight="fill" />
              </div>
              <h1>FASIH AI Assistant</h1>
              <p>
                Masukkan catatan wawancara di bawah untuk mengekstrak data ke
                format terstruktur.
              </p>
              <div
                className="welcome-categories"
                aria-label="Kategori data yang diekstrak"
              >
                {[
                  "Kepala Keluarga",
                  "ART Lainnya",
                  "Usaha",
                  "Aset",
                  "Pengeluaran",
                ].map((c) => (
                  <span key={c} className="welcome-cat-pill">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div ref={resultsEndRef} />
        </div>

        {/* Input Area (Sticky Bottom) */}
        <div className="input-area-wrapper">
          {errorMsg && <div className="error-toast">{errorMsg}</div>}
          <div className="chat-input-container">
            <textarea
              ref={textareaRef}
              className="chat-textarea modern-scrollbar"
              placeholder="Paste catatan wawancara di sini..."
              aria-label="Input catatan wawancara"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  processText();
                }
              }}
              rows={1}
            />
            <button
              className={`mic-btn ${isListening ? "listening" : ""}`}
              onClick={toggleListening}
              disabled={isProcessing}
              aria-label="Voice to Text"
              title="Gunakan Suara"
            >
              <Microphone size={16} weight={isListening ? "fill" : "regular"} />
            </button>
            <button
              className="send-btn"
              onClick={processText}
              disabled={!inputText.trim() || isProcessing}
              aria-label={
                isProcessing ? "Sedang memproses..." : "Kirim catatan"
              }
              title="Kirim (Enter)"
            >
              {isProcessing ? (
                <div className="spinner-small" aria-hidden="true" />
              ) : (
                <ArrowUp size={16} weight="bold" />
              )}
            </button>
          </div>
          <div className="input-footer">
            Tekan <b>Enter</b> untuk mengirim, <b>Shift+Enter</b> untuk baris
            baru
          </div>
        </div>
      </main>

      {/* Modal Ajari AI */}
      {showRuleModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            {/* Header */}
            <div className="modal-header">
              <div className="modal-icon" aria-hidden="true">
                <Brain size={20} weight="fill" />
              </div>
              <div className="modal-header-text">
                <h2>Memori AI</h2>
                <p className="modal-desc">
                  Aturan ini diingat AI di setiap sesi baru.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="modal-body">
              <ul className="rules-list modern-scrollbar">
                {aiRules.length === 0 && (
                  <li className="empty-rules">Belum ada ingatan.</li>
                )}
                {aiRules.map((rule) => (
                  <li key={rule.id}>{rule.content}</li>
                ))}
              </ul>

              <textarea
                className="rule-textarea modern-scrollbar"
                placeholder="Contoh: Jika status janda cerai, kodenya X."
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                rows={3}
              />
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={() => setShowRuleModal(false)}
              >
                Batal
              </button>
              <button
                className="btn-save"
                onClick={saveRule}
                disabled={isSavingRule || !newRuleText.trim()}
              >
                {isSavingRule ? "Menyimpan..." : "Simpan ke Memori AI"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
