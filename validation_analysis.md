## FASIH Validation Rules Analysis

**File:** `2230fffc-5799-4c8a-a585-12ac286c5bf9_validation.json`
**Version:** 4.6.0
**Total dataKeys with validations:** ~95 unique dataKeys
**Total individual validation rules:** ~300+ rules

### Severity Types
- **type: 0** — Silent/internal (no message shown)
- **type: 1** — Warning (soft error, confirmation prompt — "Apakah benar...?")
- **type: 2** — Error (hard validation, blocks submission)

---

## 1. REQUIRED FIELD RULES (~25 rules)

| dataKey | Condition | Message | Type |
|---------|-----------|---------|------|
| `kec_baru` | kec includes '000' && kec_baru empty | "Wajib diisi" | 2 |
| `desa_baru` | desa includes '000' && desa_baru empty | "Wajib diisi" | 2 |
| `ubah_sls` | has_ubah_sls falsy && ubah_sls empty | "Wajib diisi" | 2 |
| `kodepos` | has_kodepos falsy && kodepos empty | "Wajib diisi" | 2 |
| `geotag` | mode == 'CAPI' && geotag == 0 | "Geotaging harus terisi" | 2 |
| `jumlah_ak` | jumlah_ak < 1 | "Anggota Keluarga Minimal Berjumlah 1" | 2 |
| `nama_komersial` | empty/null | "Jika tidak memiliki nama komersial, maka tuliskan kembali nama perusahaan" | 2 |
| `luas_tanah_thn` | length < 1 | "Harus terisi" | 2 |
| `total_tk_jk` | <= 0 | "Minimal terisi 1 (pemilik usaha sendiri)" | 2 |
| `total_tk_bayar` | <= 0 | "Minimal terisi 1 (pemilik usaha sendiri)" | 2 |
| `profesi_lainnya` | profesi == '185' && profesi_lainnya empty | "Jika memilih profesi 'lainnya', maka harus diisi keterangan profesi" | 2 |
| `jml_ak_tinggal` | < 1 | "Jumlah keluarga yang tinggal dalam 1 rumah minimal 1" | 2 |
| `nama_dtsen` (via tambah_dtsen) | label null/empty/whitespace | "Nama tidak boleh kosong atau hanya berisi spasi" | 2 |
| Various `pend_*` fields | pendapatan_pekerjaan == 1 but subfield null | "Harus diisi minimal 0 jika pendapatan pekerjaan = Ya" | 2 |
| `cek_kbli_pml`, `cek_tk_jk_pml`, etc. | role == 'Pengawas' && val null | "Harus dicek oleh PML" | 2 |

---

## 2. CROSS-FIELD VALIDATION RULES (~120 rules)

### 2a. Family Relationship Validations (hubungan dataKey — 12 rules)
| Condition | Message | Type |
|-----------|---------|------|
| hubungan == 6/7 && status_kawin == 1 | "orangtua/mertua tapi belum kawin" | 2 |
| hubungan == 2/4/6/7 && status_kawin == 1 | "istri/suami/menantu/orangtua tapi belum kawin" | 2 |
| hubungan == 2 && status_kawin != 2 | "suami/istri harus berstatus kawin" | 2 |
| hubungan == 2/4/6/7 && umur_ak < 10 | "umur harus 10 tahun ke atas" | 2 |
| hubungan == 3 && umur_krt - umur_ak < 10 | "anak, selisih umur dgn KRT < 10 thn" | 1 |
| hubungan == 5 && umur_krt - umur_ak < 20 | "cucu, selisih umur dgn KRT < 20 thn" | 1 |
| hubungan == 6/7 && umur_ak < umur_krt | "orangtua tapi lebih muda dari KRT" | 1 |
| hubungan == 1 && nama_dtsen != nama_kk | "Nama KRT tidak sesuai dengan nama di blok P" | 2 |
| jum_art == 1 && jum_kk != 1 | "Jika jumlah ART = 1 maka harus kepala keluarga" | 2 |
| kepala_keluarga count > 1 | "jumlah KRT tidak boleh lebih dari 1" | 2 |
| suami count > 1 | "Jumlah Suami lebih dari 1" | 1 |
| istri count > 1 | "Jumlah Istri lebih dari 1" | 1 |

### 2b. Gender Consistency (jk_dtsen — 1 rule)
| Condition | Message | Type |
|-----------|---------|------|
| hubungan == 2 && jk same as KRT | "Suami/istri tapi jenis kelamin sama dengan KRT" | 2 |

### 2c. NIK vs Birth Date Cross-checks (tgl_lahir, bln_lahir, thn_lahir — ~8 rules)
| Condition | Message | Type |
|-----------|---------|------|
| Male: tgl_lahir != NIK digits 7-8 | "Tanggal lahir harus sama dengan digit ke-7 dan ke-8 NIK" | 1 |
| Female: tgl_lahir != (NIK digits 7-8) - 40 | "Tanggal lahir harus sesuai NIK dikurangi 40" | 1 |
| bln_lahir != NIK digits 9-10 | "Digit ke-9 dan ke-10 NIK harus sama dengan bulan lahir" | 1 |
| thn_lahir last 2 digits != NIK digits 11-12 | "Dua digit terakhir tahun lahir harus sama dengan digit 11 dan 12 NIK" | 1 |

### 2d. Business Name vs Entity Type (badan_usaha — 10+ rules)
| Condition | Message | Type |
|-----------|---------|------|
| name contains 'yayasan' && bu != '02' | "harus berkode 2" | 2 |
| name contains 'cv' && bu != '06'/'07' | "harus berkode 6 atau 7" | 2 |
| name contains 'koperasi' && bu != '03' | "harus berkode 3" | 2 |
| name contains 'dana pensiun' && bu != '04' | "harus berkode 4" | 2 |
| name contains 'perum'/'perumda' && bu != '05' | "harus berkode 5" | 2 |
| name contains 'bum desa' && bu != '06' | "harus berkode 6" | 2 |
| KBLI 6530 && bu != '04' | "harus Dana Pensiun" | 2 |
| KBLI 64191/64192 && bu != '03' | "harus Koperasi" | 2 |

### 2e. KBLI vs Category Cross-checks (kbli_genai — ~10 rules)
| Condition | Message | Type |
|-----------|---------|------|
| Name contains restaurant/hotel keywords && kategori != 'I' | "harusnya berkategori I (Akomodasi & Makan Minum)" | 1 |
| Name contains health keywords && kategori != 'R' | "harusnya berkategori R (Kesehatan)" | 1 |
| Name contains finance keywords && kategori != 'L' | "harusnya berkategori L (Keuangan)" | 1 |
| Name contains education keywords && kategori != 'Q' | "harusnya berkategori Q (Pendidikan)" | 1 |
| lokasi_usaha 1-4 && kategori != 'G' | "harus kategori G" | 2 |
| lokasi_usaha 5-9 && kategori != 'I' | "harus kategori I" | 2 |

### 2f. Worker Count Consistency (~10 rules)
| Condition | Message | Type |
|-----------|---------|------|
| total_tk_jk (male+female) != total_tk_bayar (paid+unpaid) | "Total pekerja harus sama" | 2 |
| badan_usaha == koperasi && total < 3 | "koperasi minimal 3 orang" | 2 |
| gender consistency check: JK female but total=1, laki=1, pr=0 | "Cek konsistensi jenis kelamin pengusaha" | 2 |
| tk_dibayar > 0 && gaji/tk_dibayar <= 50000 | "Nilai gaji/pekerja wajib > Rp 50.000" | 2 |
| tk_dibayar == 0 && gaji > 0 | "Wajib terisi = 0 karena pekerja dibayar=0" | 2 |
| badan_usaha formal (1-12) && tk_tdk_dibayar > 0 | "harus = 0" | 1 |

### 2g. Revenue vs Expenditure Cross-checks (~5 rules)
| Condition | Message | Type |
|-----------|---------|------|
| total_pendapatan < total_pengeluaran (annual) | "Apakah benar pengeluaran > pendapatan?" | 1 |
| total_pendapatan_bln < total_pengeluaran_bln (monthly) | Same warning for monthly | 1 |
| total_pendapatan_keluarga < total_pengeluaran_keluarga | "apa benar total pendapatan lebih kecil dari pengeluaran?" | 1 |

### 2h. Income vs Work Status (~15 rules)
| Condition | Message | Type |
|-----------|---------|------|
| profesi != '000' && pendapatan_pekerjaan == 2 && pendapatan_usaha == 2 | "bekerja tanpa pendapatan?" | 1 |
| profesi == '000' && (pend_kerja == 1 or pend_usaha == 1) | "tidak bekerja tapi punya pendapatan" | 2 |
| status_kerja == 4 (PNS) && pendapatan_pekerjaan != 1 | "PNS harus punya pendapatan" | 2 |
| status_kerja == 6 (unpaid) && has income | "pekerja tidak dibayar tidak boleh punya pendapatan" | 2 |
| status_kerja == 1/2 (berusaha) && no usaha/lain income | "berusaha harus punya pendapatan usaha" | 2 |

### 2i. Housing Material Consistency (~15 rules)
| Condition | Message | Type |
|-----------|---------|------|
| dinding tembok && lantai bambu/tanah/lainnya | "Jika dinding tembok, lantai seharusnya bukan bambu/tanah" | 1 |
| dinding selain tembok && lantai marmer/granit | "dinding bukan tembok, lantai bukan marmer" | 1 |
| atap beton && dinding != tembok | "atap beton, dinding harus tembok" | 2 |
| apartemen/rumah susun && dinding != tembok | "seharusnya kode 1" | 2 |
| apartemen/rumah susun && lantai > kode 3 | "seharusnya kode 1-3" | 2 |
| apartemen/rumah susun && atap > kode 3 | "seharusnya beton/genteng/seng" | 2 |

### 2j. Asset vs Expenditure Consistency (~15 rules)
| Condition | Message | Type |
|-----------|---------|------|
| pengeluaran_makanan < 50000 && total_aset > 7 items | "Cek pengeluaran vs aset" | 1 |
| has mobil && sumber_penerangan non-electric | "memiliki mobil harusnya listrik" | 1 |
| has laptop && sumber_penerangan non-electric | "memiliki laptop harusnya listrik" | 2 |
| has kulkas && sumber_penerangan non-electric | "memiliki kulkas harusnya listrik" | 2 |
| luas > 45m2 && good building && sewa < 100000 | "sewa terlalu rendah untuk bangunan baik" | 2 |
| luas < 36m2 && bad building && sewa > 5000000 | "sewa terlalu tinggi untuk bangunan buruk" | 2 |

### 2k. Visit/Non-response Logic
| Condition | Message | Type |
|-----------|---------|------|
| kode_bang == '9' && kunjungan_3 == 0 | "Nonrespon perlu 3x kunjungan" | 2 |
| keberadaan_usaha == '9' && kunjungan_3 == 0 | "Nonrespon perlu 3x kunjungan" | 2 |
| (bang == '9' or usaha == '9') && !kunjungan_2 | "Kunjungan II harus terisi jika Non respon" | 2 |

### 2l. Prelist Consistency (~5 rules)
| Condition | Message | Type |
|-----------|---------|------|
| prelist family, non-prelist member, keberadaan != 5 | "keberadaan harus kode 5" | 2 |
| prelist family, new member && keberadaan == 7 | "keluarga baru tidak boleh kode 7" | 2 |
| ijazah sekarang < ijazah prelist | "pendidikan seharusnya sama atau lebih tinggi" | 1 |
| sekolah_prelist > 0 && sekolah_now == 0 | "sebelumnya masih sekolah, sekarang tidak/belum pernah" | 1 |

---

## 3. NUMBER RANGE VALIDATIONS (~40 rules)

| dataKey | Range | Message | Type |
|---------|-------|---------|------|
| `umur` | 10-99 | "Wajib terisi 10-99" | 2 |
| `tk_laki` | 0-99999 | "Jumlah pekerja antara 1-99.999" | 2 |
| `tk_pr` | 0-99999 | "Jumlah pekerja antara 0-99.999" | 2 |
| `tk_dibayar` | 0-99999 | "Jumlah pekerja dibayar antara 0-99999" | 2 |
| `tahun_operasi` | 1800-2026 | "Tahun mulai beroperasi harus 1800-2026" | 2 |
| `pribadi`, `non_profit`, `publik`, `non_publik`, `pemerintah`, `asing` | 0-100 | "Rentang nilai antara 0-100" | 2 |
| `pribadi_didirikan`, etc. (6 fields) | 0-100 | "Rentang nilai antara 0-100" | 2 |
| `pendapatan_online` | max 100 | "Maksimal 100%" | 2 |
| `total_pengeluaran` | min 100000 (except A) | "Nilai minimal 100.000" | 2 |
| `total_pendapatan` | min 100000 (except A) | "Nilai minimal 100.000" | 2 |
| `total_pengeluaran_bln` | min 10000 (except A) | "Nilai minimal 10.000" | 2 |
| `gaji` max | max 900000000 | "max 900.000.000" | 2 |
| `pend_tunjangan`, `pend_uangmkn`, `pend_honor`, `pend_lembur`, `pend_lainnya` | 0-900000000 | "Rp 0 - Rp 900.000.000" | 2 |
| `aset_tanah_bln`, `aset_lain_bln` | 0-999999999999999 (excl 9999) | "Isian diluar range" | 2 |
| `pengeluaran_makanan_mingguan` | 0-50000000 | "isian di luar range" | 2 |
| `pengeluaran_non_makan_bulanan` | 0-500000000 | "isian di luar range" | 2 |
| `pengeluaran_non_makan_tahunan` | 0-900000000 | "isian di luar range" | 2 |
| `sewa_sendiri`, `sewa_kontrak`, `sewa_dinas` | min 50000 | "minimal Rp 50.000" | 2 |
| `listrik_sebulan` | 1000-9000000 (or 0) | "minimal Rp 1.000, maksimal Rp 9.000.000" | 2 |
| `thn_lahir` | 1900-current year | "Tahun tidak berada dalam rentang yang valid" | 2 |
| `thn_lahir` | < 1930 | "Apakah isian tahun lahir betul kurang dari 1930?" | 1 |
| `bln_lahir` | max 7 if year 2026 | "Untuk tahun 2026, bulan tidak boleh lebih dari Juli" | 2 |

---

## 4. FORMAT VALIDATIONS (~45 rules)

### 4a. Numeric-Only Format
| dataKey | Rule | Message | Type |
|---------|------|---------|------|
| `kodepos` | /^[0-9]+$/ | "Isian kodepos harus angka" | 2 |
| `kodepos` | length == 5 | "Panjang kodepos harus 5 digit" | 2 |
| `no_kk` | 16 digits or sentinel 7777/8888/9999 | "Nomor KK harus 16 digit angka" | 2 |
| `nik` | 16 digits or sentinel 7777/9999 | "NIK harus 16 digit" | 2 |
| `nik_dtsen` | /^[0-9]+$/ | "Isian NIK harus Angka" | 2 |
| `nik_dtsen` | 16 digits or sentinel | "NIK harus 16 digit" | 2 |
| `nik_pengusaha` | 16 digits or sentinel | "NIK harus 16 digit" | 2 |
| `nib` | 12-13 digit numeric | "Isian NIB harus numerik dan 13 digit" | 2 |
| `thn_lahir` | /^[1-9][0-9]{3}$/ | "Tahun harus berupa angka 4 digit" | 2 |
| `tgl_lahir` | /^[1-9][0-9]?$/ or 98 | "Tanggal harus berupa angka yang valid" | 2 |

### 4b. Name Format
| dataKey | Rule | Message | Type |
|---------|------|---------|------|
| `nama_kk` | /^[A-Za-z\s'",.-]+$/ and not blank/dash | "Nama KK tidak sesuai format" | 2 |
| `nama_usaha_bang` | /^[a-zA-Z0-9\s,'()-]+$/ | "hanya boleh huruf, angka, spasi, koma, apostrof, strip" | 2 |
| `nama_usaha_bang` | startsWith("PT ") | "PT diletakkan setelah nama" | 2 |
| `nama_usaha_bang` | startsWith("cv") | "CV diletakkan setelah nama" | 2 |
| `nama_usaha_edit` | same PT/CV rules | Same messages | 2 |
| `tambah_dtsen` | label must match /^[a-zA-Z\s'",.-]+$/ | "Nama tidak sesuai format" | 2 |

### 4c. Contact Format
| dataKey | Rule | Message | Type |
|---------|------|---------|------|
| `kode_area` | 3-4 digits, starts with 0 | "Kode area harus diawali angka 0" | 2 |
| `no_telp` | 5-8 digits, no repeating | "5-8 digit angka dan tidak berulang" | 2 |
| `hp` | starts with 08, 10-13 digits | "Nomor HP diawali 08, 10-13 digit" | 2 |
| `email` | strict email regex | "Email tidak valid" | 2 |
| `email_kp` | same email regex | "Email tidak valid" | 2 |
| `website` | URL pattern | "Homepage/website tidak sesuai format" | 2 |
| `id_pelanggan` | 11-13 digit | "ID pelanggan harus 11-13 digit" | 2 |
| `no_meteran` | 11-13 digit | "Nomor Meteran harus 11-13 digit" | 2 |

### 4d. Last-2-Digits-Must-Be-Zero (monetary rounding)
Applied to: `pend_tunjangan`, `pend_uangmkn`, `pend_honor`, `pend_lembur`, `pend_lainnya`, `pend_gaji`, `pend_usaha`, `nilai_pend_lain`, `sewa_sendiri`, `sewa_kontrak`, `sewa_dinas`, `nilai_motor`, `nilai_mobil`, `nilai_lahan`, `nilai_rumah`, `listrik_sebulan`, `pulsa_sebulan`, `pengeluaran_makanan_mingguan`, `pengeluaran_non_makan_bulanan`, `pengeluaran_non_makan_tahunan`

### 4e. Digit Repetition Checks
| dataKey | Rule | Message | Type |
|---------|------|---------|------|
| `kodepos` | all 5 digits same (except 99999) | "Apakah kodepos memiliki angka kembar?" | 1 |
| `no_kk` | all digits same (except sentinels) | "Apakah benar No KK berdigit sama semua?" | 2 |
| `nik`, `nik_dtsen`, `nik_pengusaha` | all digits same | "Apakah benar NIK berdigit sama semua?" | 2 |
| `nib`, `punya_nib` | all digits same | "Apakah benar NIB berdigit sama semua?" | 2 |
| `pend_gaji`, `pend_tunjangan`, `pend_usaha`, etc. | any digit 1-9 appears > 3 times | "digit berulang > 3 kali" | 2 |

### 4f. Minimum Length
| dataKey | Min | Message | Type |
|---------|-----|---------|------|
| `nama_usaha_bang`, `nama_usaha_edit`, `nama_komersial`, `nama_kawasan` | 3 chars | "Minimal 3 karakter" | 2 |
| `jalan_domisili` | 10 letters | "Minimal 10 huruf" | 2 |
| `alamat_usaha_utama` | 10 letters | "Minimal 10 huruf" | 2 |
| `rt`, `rw` | 2-50 chars | "Wajib terisi minimal 2 karakter" | 2 |
| `keg_utama` | 15 chars | "Tuliskan kegiatan utama usaha lengkap" | 2 |
| `input` | 4 chars | "Tuliskan input produksi lengkap" | 2 |
| `nib_lainnya` | 3 letters | "Wajib isi minimal 3 karakter" | 2 |
| `nama_kk`, `nama_ak_lain`, `tambah_dtsen` | 3 chars | "kurang dari 3 karakter" | 1 |

---

## 5. SKIP LOGIC RULES (~20 rules)

| dataKey | Skip When | Message | Type |
|---------|-----------|---------|------|
| `kunjungan_2/3`, `catatan_2/3` | Only triggered when bang == '9' or usaha == '9' (non-response) | "harus terisi jika Non Respon" | 2 |
| `kec_baru` | Only when kec includes '000' | "Wajib diisi" | 2 |
| `desa_baru` | Only when desa includes '000' | "Wajib diisi" | 2 |
| `alamat_dn` | umur < 17 → alamat_dn must be 1 or 4 | "umur < 17, alamat domisili harus kode 1/4" | 2 |
| `status_kawin` | umur < 10 → must be 1 (belum kawin) | "umur < 10, status perkawinan harus 1" | 2 |
| `sekolah` | umur 5-6 → must be 0 or 1 | "umur 5-6, harus kode 0 atau 1" | 2 |
| `profesi` lainnya | profesi == '185' → profesi_lainnya required | "harus diisi keterangan" | 2 |
| `internet_lainnya` | internet == '1' && all sub-items == '2' | "Salah satu 16b1-16b6 wajib Ya" | 2 |
| `sudah_halal` | halal == '1' && count == 0 | "Isikan jumlah varian" | 2 |
| `belum_halal` | halal 2/3/4 && count == 0 | "Isikan jumlah varian" | 2 |
| `sudah_bpom` / `belum_bpom` | izin_edar conditions | "Isikan jumlah varian" | 2 |
| `keberadaan_dtsen` | prelist logic determines valid codes | Multiple messages | 2 |
| `pendapatan_online` | internet == '2' → must be 0 | "Usaha tidak menggunakan internet" | 2 |
| `status_kerja` == 9 | Only when keberadaan_dtsen == 3 or 4 | "kode 9 hanya untuk keberadaan 3/4" | 2 |

---

## 6. CALCULATED FIELD RULES (~15 rules)

| dataKey | Calculation/Check | Message | Type |
|---------|-------------------|---------|------|
| `info_total` | pribadi + non_profit + publik + non_publik + pemerintah + asing must == 100 | "Penjumlahan harus sama dengan 100%" | 2 |
| `total_tk_jk` vs `total_tk_bayar` | Both totals must match | "Total pekerja harus sama" | 2 |
| `total_pengeluaran` | Sum of gaji + biaya_produksi + biaya_pembelian + operasional + non_operasional (handling 9999 sentinel) | Sum compared to pendapatan | 1 |
| `total_pendapatan` | nilai_pendapatan + pendapatan_lain vs total_pengeluaran | "pengeluaran > pendapatan?" | 1 |
| `total_pendapatan_bln` | Monthly equivalent | Same | 1 |
| `total_pengeluaran_bln` | Sum of monthly costs must > 10000 | "Total pengeluaran harus lebih dari 10.000" | 2 |
| `luas_lantai` / `jml_kk_update` | Per-capita floor area > 200 or < 3 | "luas lantai per anggota keluarga check" | 1 |
| `pengeluaran_non_makan_bulanan` | Must >= listrik + pulsa | "setidaknya sama dengan listrik + pulsa" | 1 |
| `tambah_dtsen` count vs `jumlah_ak` | Valid list items must >= jumlah_ak | "jumlah nama harus minimal sama" | 2 |
| `gabung_dtsen` keberadaan 1/5 count | Must == jumlah_ak | "jumlah anggota kode 1/5 tidak sesuai" | 2 |
| `listrik_sebulan` vs `daya_terpasang` | Electricity expenditure must match power capacity ranges (450w: 45-300K; 900w: 90-600K) | Various messages | 1 |
| `nilai_motor` / `jumlah_motor_new` | Average price check < 1M or > 50M | "rata-rata harga motor" | 1 |
| `nilai_mobil` / `jumlah_mobil_new` | Average price check < 15M or > 1B | "rata-rata harga mobil" | 1 |

---

## 7. SPECIAL / NOTABLE RULES

### 7a. President/Vice President Validation (profesi dataKey)
- profesi == 141 && nama != "prabowo subianto" → ERROR: "Presiden Indonesia hanya boleh bernama Prabowo Subianto"
- profesi == 179 && nama != "gibran rakabuming raka" → ERROR: "Wakil Presiden hanya boleh bernama Gibran Rakabuming Raka"

### 7b. Profession-Education Requirements
- Specific profesi codes require minimum education SMA (type 2) or D4/S1 (type 1)
- Certain profesi codes (PNS/TNI/etc.) require status_kerja == 4
- Profesi 129 (Petani) requires matching Kategori A usaha

### 7c. Health/Disability Cross-checks
- 12+ chronic disease fields (hipertensi, rematik, asma, jantung, diabetes, tbc, stroke, kanker, hemofilia, ginjal, hiv, kolestrol, sirosis, talasemia, leukemia, alzheimer) all check: keberadaan 1/5 → cannot answer "Tidak tahu" (code 3)
- 6 disability fields (fisik, mental, intelek, netra, rungu, wicara) same rule
- Alzheimer + dis_intelek == 2 → warning
- Stroke + dis_fisik == 2 && dis_wicara == 2 → warning

### 7d. NIK Special Rules for Prelist
- Prelist ART cannot have NIK 8888
- Kepala keluarga cannot have NIK 8888
- Non-prelist member with keberadaan != 1/5 cannot have NIK 8888

### 7e. MBG (Makan Bergizi Gratis) Role Validation
- peran_mbg == '1' (SPPG) → KBLI must start with "56"
- peran_mbg == '2' (Supplier) → kategori must be A/C/G
- peran_mbg == '3' (Penerima manfaat) → kategori must be Q/R

### 7f. Asset Ownership History
For each asset type (tabung3kg, tabung5kg, kulkas, ac, emas, laptop, motor, mobil, lahan, rumah): if previous data shows ownership (== 1) but current value === 0 → WARNING: "Sebelumnya memiliki aset ini"
