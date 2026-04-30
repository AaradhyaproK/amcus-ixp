import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Video, Users, Calendar, Clock, Printer, X, Settings, Plus } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';

const AdminStats: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  
  const [interviewsStats, setInterviewsStats] = useState({ today: 0, thisMonth: 0, total: 0 });
  const [responsesStats, setResponsesStats] = useState({ today: 0, thisMonth: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // Billing Modal State
  const [showBillModal, setShowBillModal] = useState(false);
  const [invoiceId] = useState(`INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`);
  
  const [billConfig, setBillConfig] = useState({
    clientName: 'Platform Admin',
    clientCompany: 'InterviewXpert Enterprise',
    taxRate: 18,
    items: [
      { id: 1, description: 'Candidate Interview Responses', quantity: 0, unitPrice: 15 }
    ]
  });

  useEffect(() => {
    let isMounted = true;

    const unsubInterviews = onSnapshot(collection(db, 'interviews'), async (snapshot) => {
      if (!isMounted) return;
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      let todayCount = 0;
      let monthCount = 0;
      let totalCount = snapshot.size;

      const attemptPromises: Promise<any>[] = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const timestamp = data.createdAt || data.submittedAt;
        const date = timestamp?.toDate ? timestamp.toDate() : null;
        
        if (date) {
          if (date >= startOfToday) todayCount++;
          if (date >= startOfMonth) monthCount++;
        }
        
        attemptPromises.push(getDocs(collection(db, 'interviews', doc.id, 'attempts')));
      });

      setInterviewsStats({ today: todayCount, thisMonth: monthCount, total: totalCount });
      
      try {
        const attemptSnaps = await Promise.all(attemptPromises);
        let respToday = 0;
        let respMonth = 0;
        let respTotal = 0;

        attemptSnaps.forEach(snap => {
          respTotal += snap.size;
          snap.docs.forEach(doc => {
            const data = doc.data();
            const timestamp = data.submittedAt || data.createdAt;
            const date = timestamp?.toDate ? timestamp.toDate() : null;
            if (date) {
              if (date >= startOfToday) respToday++;
              if (date >= startOfMonth) respMonth++;
            }
          });
        });
        
        if (isMounted) {
          setResponsesStats({ today: respToday, thisMonth: respMonth, total: respTotal });
        }
      } catch (error) {
        console.error("Error fetching responses:", error);
      }
      
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubInterviews();
    };
  }, []);

  const addBillItem = () => {
    setBillConfig(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), description: 'New Custom Service', quantity: 1, unitPrice: 100 }]
    }));
  };

  const removeBillItem = (id: number) => {
    setBillConfig(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const updateBillItem = (id: number, field: string, value: any) => {
    setBillConfig(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const renderInvoiceContent = () => {
    const subtotal = billConfig.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * (billConfig.taxRate / 100);
    const totalDue = subtotal + taxAmount;

    return (
      <div className="text-black font-sans w-full h-full flex flex-col bg-white">
        {/* Header */}
        <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
          <div>
            <div className="w-36 mb-2 invert">
              <Logo className="w-full" />
            </div>
            <p className="text-black font-bold text-sm">interviewxpert.in</p>
            <p className="text-gray-800 font-medium text-sm">hackathon746@gmail.com</p>
            <p className="text-gray-800 font-medium text-sm">+91 95455 56045</p>
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-black text-black uppercase tracking-widest mb-4">INVOICE</h1>
            <div className="flex justify-end gap-8 text-xs">
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Invoice No</p>
                <p className="text-black font-black text-sm">{invoiceId}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Date</p>
                <p className="text-black font-black text-sm">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bill Info */}
        <div className="flex justify-between mb-8 border-2 border-black p-4">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Billed To</p>
            <h3 className="text-xl font-black text-black uppercase leading-tight">{billConfig.clientName}</h3>
            <p className="text-black font-bold text-sm">{billConfig.clientCompany}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Billing Period</p>
            <h3 className="text-xl font-black text-black uppercase leading-tight">
              {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}
            </h3>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-left border-collapse mb-6 flex-1">
          <thead>
            <tr className="border-b-2 border-black text-[10px] uppercase tracking-widest text-black">
              <th className="py-2 font-black">Description</th>
              <th className="py-2 text-center font-black">Qty</th>
              <th className="py-2 text-right font-black">Unit Price</th>
              <th className="py-2 text-right font-black">Amount</th>
            </tr>
          </thead>
          <tbody>
            {billConfig.items.map(item => (
              <tr key={item.id} className="border-b border-gray-300">
                <td className="py-3 pr-4">
                  <p className="font-bold text-black text-base leading-tight">{item.description}</p>
                </td>
                <td className="py-3 text-center text-base font-bold text-black">{item.quantity}</td>
                <td className="py-3 text-right text-sm text-black font-medium">₹{item.unitPrice.toLocaleString()}</td>
                <td className="py-3 text-right text-base font-black text-black">₹{(item.quantity * item.unitPrice).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6 mt-4">
          <div className="w-full sm:w-2/3 md:w-1/2">
            <div className="flex justify-between py-2 border-b border-gray-300">
              <span className="text-black font-bold uppercase tracking-wider text-xs">Subtotal</span>
              <span className="font-bold text-black text-base">₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b-2 border-black">
              <span className="text-black font-bold uppercase tracking-wider text-xs">Tax ({billConfig.taxRate}%)</span>
              <span className="font-bold text-black text-base">₹{taxAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-3 px-4 mt-2 border-4 border-black">
              <span className="text-lg font-black text-black uppercase tracking-widest">Total Due</span>
              <span className="text-xl font-black text-black">₹{totalDue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 text-center mt-auto">
          <h4 className="font-black text-black mb-1 uppercase tracking-widest text-sm">Thank you for your business</h4>
          <p className="text-xs font-bold text-gray-500">This is a system-generated invoice and does not require a physical signature.</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`min-h-screen ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'} font-sans print:hidden`}>
        {/* Header */}
        <div className={`sticky top-0 z-30 flex items-center justify-between px-6 py-4 ${isDark ? 'bg-[#050505]/80 border-white/5' : 'bg-white/80 border-gray-200'} backdrop-blur-xl border-b`}>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin')} className={`p-2 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}>
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <LayoutDashboard className="text-blue-500" size={20} />
              Platform Statistics
            </h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold">Overall Platform Counts</h2>
              <p className="text-gray-500 text-sm mt-1">Real-time statistics of total interviews and candidate responses.</p>
            </div>
            <button 
              onClick={() => {
                setBillConfig(prev => ({
                  ...prev,
                  items: prev.items.map((item, index) => 
                    index === 0 ? { ...item, quantity: responsesStats.thisMonth } : item
                  )
                }));
                setShowBillModal(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5 active:scale-95 transition-all"
            >
              <Printer size={18} /> Generate Invoice
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              
              {/* Interviews Breakdown */}
              <div className={`p-8 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-xl flex flex-col items-center justify-center transition-transform hover:scale-[1.02]`}>
                <div className="p-4 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full mb-3 shadow-inner">
                  <Video size={40} />
                </div>
                <h3 className="text-sm font-bold opacity-80 mb-2 uppercase tracking-wider text-center text-gray-700 dark:text-gray-300">Total Interviews</h3>
                <p className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-500 to-red-600 mb-6">
                  {interviewsStats.total}
                </p>
                <div className="w-full flex justify-between px-6 pt-4 border-t border-gray-100 dark:border-white/5">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Calendar size={12}/> This Month</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{interviewsStats.thisMonth}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Clock size={12}/> Today</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{interviewsStats.today}</p>
                  </div>
                </div>
              </div>
              
              {/* Responses */}
              <div className={`p-8 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-xl flex flex-col items-center justify-center transition-transform hover:scale-[1.02]`}>
                <div className="p-4 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full mb-3 shadow-inner">
                  <Users size={40} />
                </div>
                <h3 className="text-sm font-bold opacity-80 mb-2 uppercase tracking-wider text-center text-gray-700 dark:text-gray-300">Candidate Responses</h3>
                <p className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-500 to-teal-600 mb-6">
                  {responsesStats.total}
                </p>
                <div className="w-full flex justify-between px-6 pt-4 border-t border-gray-100 dark:border-white/5">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Calendar size={12}/> This Month</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{responsesStats.thisMonth}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Clock size={12}/> Today</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{responsesStats.today}</p>
                  </div>
                </div>
              </div>
              
            </div>
          )}
        </div>
      </div>

      {/* Configuration & Preview Modal */}
      {showBillModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 sm:p-6 print:hidden backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl max-w-6xl w-full h-full max-h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden animate-fade-in-up">
            
            {/* Left: Configuration Panel */}
            <div className="w-full md:w-1/3 bg-gray-50 border-r border-gray-200 p-6 flex flex-col h-full">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Settings size={20} className="text-blue-600" />
                  Configure Invoice
                </h3>
                <button onClick={() => setShowBillModal(false)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Billed To</label>
                    <input type="text" value={billConfig.clientName} onChange={e => setBillConfig({...billConfig, clientName: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Company</label>
                    <input type="text" value={billConfig.clientCompany} onChange={e => setBillConfig({...billConfig, clientCompany: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
                  </div>
                </div>

                {/* Items Section */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-gray-700">Line Items</label>
                    <button onClick={addBillItem} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors">
                      <Plus size={14} /> Add Item
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {billConfig.items.map((item) => (
                      <div key={item.id} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm relative group">
                        {billConfig.items.length > 1 && (
                          <button onClick={() => removeBillItem(item.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1.5 hover:bg-red-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={14} />
                          </button>
                        )}
                        <input 
                          type="text" 
                          placeholder="Description" 
                          value={item.description} 
                          onChange={e => updateBillItem(item.id, 'description', e.target.value)} 
                          className="w-full mb-3 p-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-xs font-bold text-gray-500 mb-1 block">Qty</span>
                            <input 
                              type="number" 
                              value={item.quantity} 
                              onChange={e => updateBillItem(item.id, 'quantity', Number(e.target.value))} 
                              className="w-full p-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                            />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-gray-500 mb-1 block">Unit Price (₹)</span>
                            <input 
                              type="number" 
                              value={item.unitPrice} 
                              onChange={e => updateBillItem(item.id, 'unitPrice', Number(e.target.value))} 
                              className="w-full p-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Global Tax Rate (%)</label>
                  <input type="number" value={billConfig.taxRate} onChange={e => setBillConfig({...billConfig, taxRate: Number(e.target.value)})} className="w-1/2 p-2 border border-gray-300 rounded-lg text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
                </div>
              </div>

              <div className="mt-4 shrink-0 flex gap-3 pt-4 border-t border-gray-200">
                <button onClick={() => setShowBillModal(false)} className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-colors shadow-sm">
                  Cancel
                </button>
                <button onClick={() => window.print()} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
                  <Printer size={18} /> Print Now
                </button>
              </div>
            </div>

            {/* Right: Live Preview Panel */}
            <div className="w-full md:w-2/3 bg-gray-200 p-4 sm:p-8 flex justify-center items-start overflow-y-auto h-full hidden md:flex custom-scrollbar">
              <div className="bg-white w-full max-w-3xl min-h-[1000px] shadow-2xl p-10 transform origin-top border border-gray-300">
                 {renderInvoiceContent()}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Print-Only Actual Layout (Used exclusively during window.print()) */}
      <div className="hidden print:block bg-white text-black p-10 font-sans min-h-screen max-w-4xl mx-auto">
        {renderInvoiceContent()}
      </div>
    </>
  );
};

export default AdminStats;
