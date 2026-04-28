import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, LineChart, Line } from 'recharts';
import { AlertCircle, FileWarning, Frown, Scale, Clock, DollarSign, Target } from 'lucide-react';

const fakeResumeData = [
  { name: 'Embellished/Fake', value: 78 },
  { name: 'Accurate', value: 22 },
];

const biasData = [
  { name: 'Unconscious Bias', value: 54 },
  { name: 'Fair Assessment', value: 46 }
];

const accuracyData = [
  { method: 'Unstructured', accuracy: 14 },
  { method: 'Traditional Structured', accuracy: 55 },
  { method: 'AI-Assisted', accuracy: 88 },
];

const costData = [
  { month: 'M1', cost: 10 },
  { month: 'M2', cost: 30 },
  { month: 'M3', cost: 60 },
  { month: 'M4', cost: 120 },
  { month: 'Bad Hire Cost', cost: 300 }
];

const timeData = [
  { process: 'Traditional', days: 42 },
  { process: 'AI Automated', days: 3 }
];

const hiringCostData = [
  { process: 'Traditional', cost: 4000 },
  { process: 'AI Platform', cost: 150 }
];

const skillShortlistData = [
  { phase: 'Resume Screen', accuracy: 30 },
  { phase: 'Recruiter Chat', accuracy: 45 },
  { phase: 'Tech Interview', accuracy: 65 },
  { phase: 'AI Shortlist', accuracy: 96 }
];

const COLORS_RED = ['#ef4444', '#1e293b'];
const COLORS_ORANGE = ['#f97316', '#1e293b'];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#121216]/90 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl">
        <p className="text-white font-bold">{`${payload[0].name || payload[0].payload.method || payload[0].payload.month}: ${payload[0].value}${payload[0].name ? '%' : '%'}`}</p>
      </div>
    );
  }
  return null;
};

const ProblemWeSolve: React.FC = () => {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-0 right-0 w-full h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-red-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 font-bold text-xs uppercase tracking-widest mb-6 border border-red-500/20">
            <AlertCircle size={14} /> The Industry Crisis
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6">
            Why Hiring is <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">Broken</span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Traditional recruiting relies on outdated, easily manipulated processes ranging from fake resumes to heavy unconscious bias. InterviewXpert was built to solve these systemic failures.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mt-12">
          
          {/* Card 1: Fake Resumes */}
          <div className="bg-white/50 dark:bg-[#121216]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-8 flex flex-col items-center shadow-xl hover:shadow-2xl hover:border-red-500/30 transition-all duration-300">
            <div className="w-full flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                  <FileWarning className="text-red-500" size={24} /> The Resume Illusion
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">Of all candidate resumes contain misleading statements or completely fake credentials.</p>
              </div>
              <div className="text-4xl font-black text-red-500">78%</div>
            </div>
            <div className="w-full h-48 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fakeResumeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {fakeResumeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS_RED[index % COLORS_RED.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 w-full text-center text-sm font-medium text-slate-400">
              <span className="text-red-500 font-bold">Solution:</span> We test actual skills via AI, ignoring PDF embellishments.
            </div>
          </div>

          {/* Card 2: Interview Bias */}
          <div className="bg-white/50 dark:bg-[#121216]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-8 flex flex-col items-center shadow-xl hover:shadow-2xl hover:border-orange-500/30 transition-all duration-300">
            <div className="w-full flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                  <Scale className="text-orange-500" size={24} /> Unconscious Bias
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">Of hiring decisions are influenced by unconscious human bias within the first 5 minutes.</p>
              </div>
              <div className="text-4xl font-black text-orange-500">54%</div>
            </div>
            <div className="w-full h-48 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={biasData}
                    cx="50%"
                    cy="50%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {biasData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS_ORANGE[index % COLORS_ORANGE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 w-full text-center text-sm font-medium text-slate-400">
              <span className="text-orange-500 font-bold">Solution:</span> AI evaluates strictly on merit, communication clarity, and logic.
            </div>
          </div>

          {/* Card 3: Poor Predictive Accuracy */}
          <div className="bg-white/50 dark:bg-[#121216]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-8 flex flex-col shadow-xl hover:shadow-2xl hover:border-blue-500/30 transition-all duration-300">
            <div className="w-full mb-6 relative z-10 flex-grow-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <Frown className="text-blue-500" size={24} /> The Unstructured Interview
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Human-led unstructured interviews have notoriously low predictive validity for actual job performance.</p>
            </div>
            <div className="w-full h-48 mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accuracyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="method" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.02)'}} content={<CustomTooltip />} />
                  <Bar dataKey="accuracy" radius={[6, 6, 0, 0]}>
                    {accuracyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 2 ? '#3b82f6' : '#334155'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 w-full text-center text-sm font-medium text-slate-400">
              <span className="text-blue-500 font-bold">Solution:</span> Structured, algorithmically scored AI interviews boast ~88% accuracy.
            </div>
          </div>

          {/* Card 4: Cost of a Bad Hire */}
          <div className="bg-white/50 dark:bg-[#121216]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-8 flex flex-col shadow-xl hover:shadow-2xl hover:border-purple-500/30 transition-all duration-300">
            <div className="w-full mb-6 relative z-10 flex-grow-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <AlertCircle className="text-purple-500" size={24} /> The Cost of a Bad Hire
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Hiring candidates based on fake resumes or bad interviews costs companies up to 30% of the employee's first-year earnings.</p>
            </div>
            <div className="w-full h-48 mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={costData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="cost" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 w-full text-center text-sm font-medium text-slate-400">
              <span className="text-purple-500 font-bold">Solution:</span> Rigorous end-to-end AI validation prevents catastrophic hiring mistakes.
            </div>
          </div>

          {/* Card 5: Massive Cost Reduction */}
          <div className="bg-white/50 dark:bg-[#121216]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-8 flex flex-col shadow-xl hover:shadow-2xl hover:border-emerald-500/30 transition-all duration-300">
            <div className="w-full mb-6 relative z-10 flex-grow-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <DollarSign className="text-emerald-500" size={24} /> Drastic Cost Reduction
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Cut the traditional cost of hiring down from thousands per candidate to just a few fractions of a fraction.</p>
            </div>
            <div className="w-full h-48 mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hiringCostData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <YAxis type="category" dataKey="process" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={80} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.02)'}} content={<CustomTooltip />} />
                  <Bar dataKey="cost" radius={[0, 6, 6, 0]} barSize={30}>
                    {hiringCostData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 1 ? '#10b981' : '#334155'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 w-full text-center text-sm font-medium text-slate-400">
              <span className="text-emerald-500 font-bold">Advantage:</span> Pay only for verified AI compute time, eliminating massive agency overheads.
            </div>
          </div>

          {/* Card 6: Accelerated Time-to-Hire */}
          <div className="bg-white/50 dark:bg-[#121216]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-8 flex flex-col shadow-xl hover:shadow-2xl hover:border-cyan-500/30 transition-all duration-300">
            <div className="w-full mb-6 relative z-10 flex-grow-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <Clock className="text-cyan-500" size={24} /> Accelerated Timelines
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Save weeks of back-and-forth scheduling coordination. AI interviews happen immediately when candidates apply.</p>
            </div>
            <div className="w-full h-48 mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="process" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}d`} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.02)'}} content={<CustomTooltip />} />
                  <Bar dataKey="days" radius={[6, 6, 0, 0]}>
                    {timeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 1 ? '#06b6d4' : '#334155'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 w-full text-center text-sm font-medium text-slate-400">
              <span className="text-cyan-500 font-bold">Advantage:</span> The average 42-day cycle plummets down to just ~3 days of review phase.
            </div>
          </div>

          {/* Card 7: Skill-Based Shortlisting Accuracy */}
          <div className="bg-white/50 dark:bg-[#121216]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-8 flex flex-col shadow-xl hover:shadow-2xl hover:border-pink-500/30 transition-all duration-300 md:col-span-2 lg:col-span-3 xl:col-span-1">
            <div className="w-full mb-6 relative z-10 flex-grow-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                <Target className="text-pink-500" size={24} /> Precision Shortlisting
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Sort incoming candidates objectively by their performance, mapped explicitly to technical skills.</p>
            </div>
            <div className="w-full h-48 mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={skillShortlistData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="phase" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="accuracy" stroke="#ec4899" strokeWidth={4} dot={{ r: 6, fill: '#ec4899', strokeWidth: 2, stroke: '#121216' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 w-full text-center text-sm font-medium text-slate-400">
              <span className="text-pink-500 font-bold">Advantage:</span> Reach 96% confidence in candidate capabilities before a single human meeting.
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default ProblemWeSolve;
