import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Settings,
  History,
  ScanLine,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  AlertCircle,
  Trash2,
  Keyboard,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('scan');
  const [gasUrl, setGasUrl] = useState('');
  const [location, setLocation] = useState('Gudang Utama');
  const [locationsList, setLocationsList] = useState(
    'Gudang Utama\nKantor Depan\nLantai 2\nGudang Belakang'
  );
  const [condition, setCondition] = useState('Baik');
  const [barcode, setBarcode] = useState('');
  const [logs, setLogs] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const barcodeInputRef = useRef(null);

  // Load data dari LocalStorage saat pertama kali dimuat
  useEffect(() => {
    const savedUrl = localStorage.getItem('gasUrl');
    const savedLocation = localStorage.getItem('defaultLocation');
    const savedLocationsList = localStorage.getItem('locationsList');
    const savedLogs = localStorage.getItem('opnameLogs');

    if (savedUrl) setGasUrl(savedUrl);
    if (savedLocation) setLocation(savedLocation);
    if (savedLocationsList) setLocationsList(savedLocationsList);
    if (savedLogs) setLogs(JSON.parse(savedLogs));
  }, []);

  // Simpan pengaturan dan riwayat ke LocalStorage setiap ada perubahan
  useEffect(() => {
    localStorage.setItem('opnameLogs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('gasUrl', gasUrl);
  }, [gasUrl]);

  useEffect(() => {
    localStorage.setItem('defaultLocation', location);
  }, [location]);

  useEffect(() => {
    localStorage.setItem('locationsList', locationsList);
  }, [locationsList]);

  // Logika Scanner Kamera menggunakan library html5-qrcode
  useEffect(() => {
    let html5QrCode;

    if (cameraActive) {
      if (!window.Html5Qrcode) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode';
        script.onload = startCamera;
        document.body.appendChild(script);
      } else {
        startCamera();
      }
    }

    function startCamera() {
      // Pastikan elemen #reader sudah ada di DOM
      setTimeout(() => {
        const readerElement = document.getElementById('reader');
        if (!readerElement) return;

        html5QrCode = new window.Html5Qrcode('reader');
        html5QrCode
          .start(
            { facingMode: 'environment' }, // Gunakan kamera belakang jika di HP
            { fps: 10, qrbox: { width: 250, height: 150 } },
            (decodedText) => {
              setBarcode(decodedText);
              setCameraActive(false); // Matikan kamera setelah berhasil scan
              if (html5QrCode) {
                html5QrCode.stop().catch(console.error);
              }
            },
            (errorMessage) => {
              // Abaikan error frame yang gagal terbaca
            }
          )
          .catch((err) => {
            alert(
              'Gagal mengakses kamera. Pastikan izin kamera diberikan. Error: ' +
                err
            );
            setCameraActive(false);
          });
      }, 100);
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [cameraActive]);

  // Handle Submit Aset Baru
  const handleScanSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!barcode.trim()) {
      alert('Kode aset/barcode tidak boleh kosong!');
      return;
    }

    const newLog = {
      id: Date.now().toString(),
      barcode: barcode.trim(),
      location,
      condition,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    setLogs((prev) => [newLog, ...prev]);
    setBarcode(''); // Reset input
    if (barcodeInputRef.current) barcodeInputRef.current.focus(); // Fokus kembali ke input

    // Langsung coba sinkronisasi
    syncSingleLog(newLog);
  };

  // Fungsi sinkronisasi 1 data
  const syncSingleLog = async (logData) => {
    if (!gasUrl) return;

    try {
      const formData = new URLSearchParams();
      formData.append('barcode', logData.barcode);
      formData.append('location', logData.location);
      formData.append('condition', logData.condition);
      formData.append('timestamp', logData.timestamp);

      // mode: 'no-cors' digunakan agar browser tidak memblokir request lintas origin
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      updateLogStatus(logData.id, 'success');
    } catch (error) {
      console.error('Sync error:', error);
      updateLogStatus(logData.id, 'failed');
    }
  };

  // Fungsi sinkronisasi massal untuk data yang pending/gagal
  const syncPendingLogs = async () => {
    if (!gasUrl) {
      alert(
        'Harap atur URL Spreadsheet (Google Apps Script) di menu Pengaturan terlebih dahulu.'
      );
      setActiveTab('settings');
      return;
    }

    setIsSyncing(true);
    const pendingLogs = logs.filter((l) => l.status !== 'success');
    let updatedLogs = [...logs];

    for (let log of pendingLogs) {
      try {
        const formData = new URLSearchParams();
        formData.append('barcode', log.barcode);
        formData.append('location', log.location);
        formData.append('condition', log.condition);
        formData.append('timestamp', log.timestamp);

        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });

        const index = updatedLogs.findIndex((l) => l.id === log.id);
        if (index !== -1) updatedLogs[index].status = 'success';
      } catch (e) {
        const index = updatedLogs.findIndex((l) => l.id === log.id);
        if (index !== -1) updatedLogs[index].status = 'failed';
      }
    }

    setLogs(updatedLogs);
    setIsSyncing(false);
  };

  const updateLogStatus = (id, newStatus) => {
    setLogs((prev) =>
      prev.map((log) => (log.id === id ? { ...log, status: newStatus } : log))
    );
  };

  const clearHistory = () => {
    if (
      window.confirm(
        'Hapus semua riwayat scan secara permanen? Data di Spreadsheet tidak akan terhapus.'
      )
    ) {
      setLogs([]);
    }
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return (
      date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) +
      ' - ' +
      date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    );
  };

  return (
    <div className="bg-gray-100 min-h-screen flex justify-center font-sans text-gray-800">
      {/* Container diubah jadi w-full penuh di HP, dan max-w-md hanya di layar besar */}
      <div className="w-full sm:max-w-md bg-white sm:bg-gray-50 flex flex-col relative sm:shadow-xl min-h-screen">
        {/* Header */}
        <header className="bg-blue-800 text-white p-4 sm:rounded-b-none shadow-md z-10 sticky top-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ScanLine size={24} />
            Stock Opname Aset BI Tasikmalaya
          </h1>
          <p className="text-blue-100 text-sm mt-1">
            Sistem Pencocokan Aset Real-time
          </p>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 pb-24 bg-gray-50 sm:bg-transparent">
          {/* TAB: SCANNER */}
          {activeTab === 'scan' && (
            <div className="space-y-4 animate-in fade-in zoom-in duration-200">
              {/* Pesan Peringatan jika belum ada URL */}
              {!gasUrl && (
                <div className="bg-amber-100 border-l-4 border-amber-500 p-3 rounded-lg text-sm text-amber-800 flex gap-2 mb-4">
                  <AlertCircle size={20} className="shrink-0" />
                  <p>
                    Anda belum mengatur URL Spreadsheet. Data hanya akan
                    tersimpan di perangkat ini.{' '}
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="font-bold underline"
                    >
                      Atur sekarang
                    </button>
                    .
                  </p>
                </div>
              )}

              {/* Area Kamera Scanner */}
              <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100">
                {cameraActive ? (
                  <div className="flex flex-col items-center">
                    <div
                      id="reader"
                      className="w-full overflow-hidden rounded-lg bg-black text-white text-center"
                    ></div>
                    <button
                      onClick={() => setCameraActive(false)}
                      className="mt-4 px-4 py-3 w-full bg-red-50 text-red-600 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      <XCircle size={18} /> Batal & Tutup Kamera
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCameraActive(true)}
                    className="w-full py-10 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 text-blue-800 flex flex-col items-center gap-3 hover:bg-blue-100 transition-colors"
                  >
                    <Camera size={44} className="text-blue-600" />
                    <span className="font-semibold text-lg">
                      Gunakan Kamera
                    </span>
                    <span className="text-sm text-blue-700 font-normal">
                      Ketuk untuk memindai Barcode/QR
                    </span>
                  </button>
                )}
              </div>

              {/* Form Input Manual / Scanner Fisik */}
              <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100">
                <form onSubmit={handleScanSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                      <Keyboard size={16} /> Kode Aset / Barcode
                    </label>
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Contoh:"
                      className="w-full p-3 sm:p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-lg uppercase transition-all"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Gunakan scanner fisik (USB/Bluetooth) atau ketik manual.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Lokasi Ditemukan
                      </label>
                      <select
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                      >
                        {locationsList
                          .split('\n')
                          .filter((l) => l.trim() !== '')
                          .map((loc, idx) => (
                            <option key={idx} value={loc.trim()}>
                              {loc.trim()}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Kondisi Aset
                      </label>
                      <select
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                      >
                        <option value="Baik">Baik</option>
                        <option value="Rusak Ringan">Rusak Ringan</option>
                        <option value="Rusak Berat">Rusak Berat</option>
                        <option value="Hilang">Hilang</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-800 hover:bg-blue-900 text-white font-bold py-3 sm:py-4 rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors mt-4 text-lg"
                  >
                    <Save size={24} /> Rekam Aset
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">
                    Riwayat Scan
                  </h2>
                  <p className="text-sm text-gray-500">
                    {logs.length} data tersimpan
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={syncPendingLogs}
                    disabled={isSyncing}
                    className="p-2 sm:p-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                    title="Sinkronisasi yang pending"
                  >
                    <RefreshCw
                      size={22}
                      className={isSyncing ? 'animate-spin' : ''}
                    />
                  </button>
                  <button
                    onClick={clearHistory}
                    className="p-2 sm:p-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                    title="Hapus riwayat lokal"
                  >
                    <Trash2 size={22} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {logs.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400">
                    <History size={64} className="mx-auto mb-4 opacity-20" />
                    <p className="text-lg">Belum ada riwayat scan</p>
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 transition-all hover:shadow-md"
                    >
                      <div className="shrink-0">
                        {log.status === 'success' && (
                          <CheckCircle2 className="text-green-500" size={28} />
                        )}
                        {log.status === 'pending' && (
                          <RefreshCw className="text-amber-500" size={28} />
                        )}
                        {log.status === 'failed' && (
                          <XCircle className="text-red-500" size={28} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-800 text-lg truncate">
                          {log.barcode}
                        </h3>
                        <div className="flex flex-wrap text-xs text-gray-600 gap-2 mt-1">
                          <span className="bg-gray-100 px-2 py-1 rounded-md">
                            {log.location}
                          </span>
                          <span className="bg-gray-100 px-2 py-1 rounded-md">
                            {log.condition}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-gray-400">
                          {formatDate(log.timestamp).split(' - ')[0]}
                        </div>
                        <div className="text-xs font-semibold mt-1">
                          {log.status === 'success' && (
                            <span className="text-green-600">Tersimpan</span>
                          )}
                          {log.status === 'pending' && (
                            <span className="text-amber-600">Menunggu</span>
                          )}
                          {log.status === 'failed' && (
                            <span className="text-red-600">Gagal</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-4 animate-in fade-in zoom-in duration-200">
              <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
                <div>
                  <h2 className="font-bold text-xl text-gray-800 mb-3 border-b pb-3">
                    Koneksi Spreadsheet
                  </h2>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    URL Web App (Google Apps Script)
                  </label>
                  <input
                    type="url"
                    value={gasUrl}
                    onChange={(e) => setGasUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Aplikasi ini menggunakan Google Apps Script untuk menyimpan
                    data langsung ke Spreadsheet Anda. Silakan lihat panduan
                    yang disediakan untuk cara membuat URL ini.
                  </p>
                </div>

                <div>
                  <h2 className="font-bold text-xl text-gray-800 mb-3 border-b pb-3">
                    Preferensi Aplikasi
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Daftar Pilihan Lokasi (Dropdown)
                      </label>
                      <textarea
                        value={locationsList}
                        onChange={(e) => setLocationsList(e.target.value)}
                        rows={5}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 text-sm"
                        placeholder="Ketik lokasi, pisahkan dengan baris baru (Enter)"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        Ketik setiap lokasi di baris baru. Ini akan muncul
                        sebagai pilihan di menu Scan.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Lokasi Default
                      </label>
                      <select
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                      >
                        {locationsList
                          .split('\n')
                          .filter((l) => l.trim() !== '')
                          .map((loc, idx) => (
                            <option key={idx} value={loc.trim()}>
                              {loc.trim()}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="bg-white border-t border-gray-200 flex fixed bottom-0 w-full sm:max-w-md pb-safe z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 flex flex-col items-center p-3 sm:p-4 transition-colors ${
              activeTab === 'scan'
                ? 'text-blue-800 font-bold'
                : 'text-gray-500 hover:text-blue-600'
            }`}
          >
            <ScanLine size={26} className="mb-1" />
            <span className="text-xs sm:text-sm">Scan Aset</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex flex-col items-center p-3 sm:p-4 transition-colors relative ${
              activeTab === 'history'
                ? 'text-blue-800 font-bold'
                : 'text-gray-500 hover:text-blue-600'
            }`}
          >
            <History size={26} className="mb-1" />
            <span className="text-xs sm:text-sm">Riwayat</span>
            {logs.filter((l) => l.status !== 'success').length > 0 && (
              <span className="absolute top-2 right-6 sm:right-10 bg-red-500 text-white text-[10px] sm:text-xs w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm">
                {logs.filter((l) => l.status !== 'success').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex flex-col items-center p-3 sm:p-4 transition-colors ${
              activeTab === 'settings'
                ? 'text-blue-800 font-bold'
                : 'text-gray-500 hover:text-blue-600'
            }`}
          >
            <Settings size={26} className="mb-1" />
            <span className="text-xs sm:text-sm">Pengaturan</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
