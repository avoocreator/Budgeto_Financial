# Budgeto – Personal Finance

Aplikasi web pencatat keuangan pribadi berbasis Google Spreadsheet. Tidak perlu akun, tidak ada server berbayar — data tersimpan langsung di Google Spreadsheet milikmu sendiri.

---

## Cara Menggunakan

### 1. Buat Google Spreadsheet

1. Buka [Google Sheets](https://sheets.google.com) dan buat spreadsheet baru.
2. Beri nama spreadsheet sesuka kamu, misalnya **"Budgeto Data"**.

---

### 2. Pasang Google Apps Script

1. Di dalam spreadsheet, klik menu **Ekstensi → Apps Script**.
2. Hapus semua kode yang ada di editor (biasanya ada fungsi `myFunction` kosong).
3. Buka file `Code.gs` dari repository ini, lalu **salin semua isinya** dan tempel ke editor Apps Script.
4. Klik ikon **💾 Simpan** (atau tekan `Ctrl+S`).

---

### 3. Deploy sebagai Web App

1. Klik tombol **Deploy → New deployment**.
2. Klik ikon ⚙️ di samping "Select type", pilih **Web app**.
3. Isi konfigurasi berikut:
   - **Description**: bebas, misal `Budgeto v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
4. Klik **Deploy**.
5. Jika diminta izin akses, klik **Authorize access** dan ikuti langkah-langkahnya.
6. Setelah selesai, kamu akan mendapat **URL Web App** — salin URL tersebut.

---

### 4. Hubungkan ke Website Budgeto

1. Buka website Budgeto di browser.
2. Saat pertama kali membuka, akan muncul form pengaturan awal.
3. Tempel URL Web App yang sudah disalin tadi ke kolom yang tersedia.
4. Klik **Simpan / Connect** — aplikasi siap digunakan!

---

### 5. (Opsional) Tambahkan ke Layar Utama HP

Agar Budgeto terasa seperti aplikasi sungguhan di ponselmu:

**Android (Chrome):**
1. Buka website Budgeto di Chrome.
2. Ketuk ikon **⋮ (tiga titik)** di pojok kanan atas.
3. Pilih **Tambahkan ke layar utama**.
4. Ketuk **Tambahkan**.

**iPhone/iPad (Safari):**
1. Buka website Budgeto di Safari.
2. Ketuk ikon **Share (kotak dengan panah ke atas)** di bagian bawah.
3. Pilih **Add to Home Screen**.
4. Ketuk **Add**.

Setelah ditambahkan, ikon Budgeto akan muncul di layar utama dan bisa dibuka seperti aplikasi biasa — tanpa tampilan browser.

---

## Teknologi yang Digunakan

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Google Apps Script
- **Database**: Google Spreadsheet
- **Charts**: Chart.js
- **Hosting**: Vercel (atau platform statis lainnya)

---

## Catatan

- Data kamu tersimpan sepenuhnya di Google Spreadsheet milikmu sendiri, bukan di server pihak ketiga.
- Pastikan pengaturan deploy Apps Script selalu **"Execute as: Me"** dan **"Who has access: Anyone"** agar website bisa terhubung.
- Jika suatu saat melakukan update pada `Code.gs`, kamu perlu membuat deployment baru (**New deployment**) dan memperbarui URL-nya di aplikasi.
