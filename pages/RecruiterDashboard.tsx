import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Interview } from '../types';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import gsap from 'gsap';
import { useMessageBox } from '../components/MessageBox';
import EditJobModal from './EditJob';

type TimestampLike =
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
    }
  | Date
  | string
  | null
  | undefined;

interface RecruiterJobRecord {
  id: string;
  title?: string;
  companyName?: string;
  location?: string;
  category?: string;
  employmentType?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  postedAt?: TimestampLike;
  applyDeadline?: TimestampLike;
  recruiterUID?: string;
}

interface RecruiterInterviewRecord extends Partial<Interview> {
  id: string;
  recruiterUID?: string;
  title?: string;
  description?: string;
  department?: string;
  employmentType?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  deadline?: TimestampLike;
  candidateEmails?: string[];
  isMock?: boolean;
}

interface RecruiterTestRecord {
  id: string;
  title?: string;
  createdAt?: TimestampLike;
  questions?: unknown[];
}

interface InterviewAttemptRecord {
  id: string;
  interviewId?: string;
  submittedAt?: TimestampLike;
}

interface DashboardRoleEntry {
  id: string;
  title: string;
  location: string;
  companyName?: string;
  category?: string;
  employmentType?: string;
  createdAt?: TimestampLike;
  deadline?: TimestampLike;
  sourceLabel: 'Job Post' | 'Interview' | 'Synced';
  hasJobDoc: boolean;
  hasInterviewDoc: boolean;
  candidateEmails: string[];
}

const toMillis = (value: TimestampLike): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatDate = (value: TimestampLike, options?: Intl.DateTimeFormatOptions): string => {
  const millis = toMillis(value);
  if (!millis) return 'N/A';
  return new Date(millis).toLocaleDateString('en-GB', options || {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const normalizeInterviewTitle = (title?: string) => {
  if (!title) return 'Untitled Role';
  return title.replace(/\s+Interview$/i, '').trim() || 'Untitled Role';
};

const getLocalDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const RecruiterDashboard: React.FC = () => {
  const { user } = useAuth();
  const [jobDocs, setJobDocs] = useState<RecruiterJobRecord[]>([]);
  const [interviews, setInterviews] = useState<RecruiterInterviewRecord[]>([]);
  const [tests, setTests] = useState<RecruiterTestRecord[]>([]);
  const [attempts, setAttempts] = useState<InterviewAttemptRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingInterviews, setLoadingInterviews] = useState(true);
  const [loadingTests, setLoadingTests] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(true);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const messageBox = useMessageBox();

  useEffect(() => {
    if (loadingJobs || loadingInterviews || loadingTests || loadingAttempts) return;

    const ctx = gsap.context(() => {
      gsap.from('.dashboard-header', {
        y: -20,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
      });

      gsap.from('.kpi-card', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        delay: 0.2,
        ease: 'power2.out',
      });

      gsap.from('.analytics-card', {
        scale: 0.95,
        opacity: 0,
        duration: 0.6,
        stagger: 0.15,
        delay: 0.4,
        ease: 'power2.out',
      });

      gsap.from('.jobs-table-section', {
        y: 40,
        opacity: 0,
        duration: 0.8,
        delay: 0.6,
        ease: 'power3.out',
      });
    });

    return () => ctx.revert();
  }, [loadingJobs, loadingInterviews, loadingTests, loadingAttempts]);

  useEffect(() => {
    if (!user) {
      setJobDocs([]);
      setInterviews([]);
      setTests([]);
      setAttempts([]);
      setLoadingJobs(false);
      setLoadingInterviews(false);
      setLoadingTests(false);
      setLoadingAttempts(false);
      return;
    }

    setLoadingJobs(true);
    setLoadingInterviews(true);
    setLoadingTests(true);

    const jobsQuery = query(collection(db, 'jobs'), where('recruiterUID', '==', user.uid));
    const interviewsQuery = query(collection(db, 'interviews'), where('recruiterUID', '==', user.uid));
    const testsQuery = query(collection(db, 'tests'), where('recruiterUID', '==', user.uid));

    const unsubscribeJobs = onSnapshot(
      jobsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        } as RecruiterJobRecord));
        setJobDocs(records);
        setLoadingJobs(false);
      },
      (error) => {
        console.error('Error fetching recruiter jobs:', error);
        setJobDocs([]);
        setLoadingJobs(false);
      }
    );

    const unsubscribeInterviews = onSnapshot(
      interviewsQuery,
      (snapshot) => {
        const records = snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          } as RecruiterInterviewRecord))
          .filter((record) => record.isMock !== true);
        setInterviews(records);
        setLoadingInterviews(false);
      },
      (error) => {
        console.error('Error fetching recruiter interviews:', error);
        setInterviews([]);
        setLoadingInterviews(false);
      }
    );

    const unsubscribeTests = onSnapshot(
      testsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        } as RecruiterTestRecord));
        setTests(records);
        setLoadingTests(false);
      },
      (error) => {
        console.error('Error fetching recruiter tests:', error);
        setTests([]);
        setLoadingTests(false);
      }
    );

    return () => {
      unsubscribeJobs();
      unsubscribeInterviews();
      unsubscribeTests();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAttempts([]);
      setLoadingAttempts(false);
      return;
    }

    const interviewIds = interviews.map((interview) => interview.id);
    if (interviewIds.length === 0) {
      setAttempts([]);
      setLoadingAttempts(false);
      return;
    }

    setLoadingAttempts(true);

    const attemptsByInterview = new Map<string, InterviewAttemptRecord[]>();
    const initializedInterviews = new Set<string>();

    const syncAttemptState = () => {
      const mergedAttempts = Array.from(attemptsByInterview.values())
        .flat()
        .sort((left, right) => toMillis(right.submittedAt) - toMillis(left.submittedAt));
      setAttempts(mergedAttempts);
    };

    const unsubscribers = interviewIds.map((interviewId) => {
      const attemptsQuery = collection(db, 'interviews', interviewId, 'attempts');
      return onSnapshot(
        attemptsQuery,
        (snapshot) => {
          attemptsByInterview.set(
            interviewId,
            snapshot.docs.map((snapshotDoc) => ({
              id: snapshotDoc.id,
              ...snapshotDoc.data(),
            } as InterviewAttemptRecord))
          );
          syncAttemptState();

          if (!initializedInterviews.has(interviewId)) {
            initializedInterviews.add(interviewId);
            if (initializedInterviews.size === interviewIds.length) {
              setLoadingAttempts(false);
            }
          }
        },
        (error) => {
          console.error('Error fetching interview attempts:', error);
          attemptsByInterview.set(interviewId, []);
          syncAttemptState();

          if (!initializedInterviews.has(interviewId)) {
            initializedInterviews.add(interviewId);
            if (initializedInterviews.size === interviewIds.length) {
              setLoadingAttempts(false);
            }
          }
        }
      );
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [interviews, user]);

  const dashboardRoles = useMemo<DashboardRoleEntry[]>(() => {
    const roleMap = new Map<string, DashboardRoleEntry>();

    jobDocs.forEach((job) => {
      roleMap.set(job.id, {
        id: job.id,
        title: job.title || 'Untitled Role',
        location: job.location || 'Remote',
        companyName: job.companyName,
        category: job.category,
        employmentType: job.employmentType,
        createdAt: job.createdAt || job.postedAt || job.updatedAt,
        deadline: job.applyDeadline,
        sourceLabel: 'Job Post',
        hasJobDoc: true,
        hasInterviewDoc: false,
        candidateEmails: [],
      });
    });

    interviews.forEach((interview) => {
      const existingEntry = roleMap.get(interview.id);
      const interviewEntry: DashboardRoleEntry = {
        id: interview.id,
        title: normalizeInterviewTitle(interview.title),
        location: existingEntry?.location || 'Remote',
        companyName: existingEntry?.companyName,
        category: interview.department || existingEntry?.category,
        employmentType: interview.employmentType || existingEntry?.employmentType,
        createdAt: existingEntry?.createdAt || interview.createdAt || interview.updatedAt,
        deadline: existingEntry?.deadline || interview.deadline,
        sourceLabel: existingEntry ? 'Synced' : 'Interview',
        hasJobDoc: existingEntry?.hasJobDoc || false,
        hasInterviewDoc: true,
        candidateEmails: interview.candidateEmails || existingEntry?.candidateEmails || [],
      };

      if (existingEntry) {
        roleMap.set(interview.id, {
          ...existingEntry,
          ...interviewEntry,
          title: existingEntry.title || interviewEntry.title,
          location: existingEntry.location || interviewEntry.location,
          sourceLabel: 'Synced',
          hasJobDoc: true,
          hasInterviewDoc: true,
          candidateEmails: interviewEntry.candidateEmails,
        });
      } else {
        roleMap.set(interview.id, interviewEntry);
      }
    });

    return Array.from(roleMap.values()).sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
  }, [interviews, jobDocs]);

  const attemptsByInterview = useMemo(() => {
    return attempts.reduce((accumulator, attempt) => {
      if (!attempt.interviewId) return accumulator;
      accumulator.set(attempt.interviewId, (accumulator.get(attempt.interviewId) || 0) + 1);
      return accumulator;
    }, new Map<string, number>());
  }, [attempts]);

  const totalInvites = useMemo(() => {
    return interviews.reduce((total, interview) => total + (interview.candidateEmails?.length || 0), 0);
  }, [interviews]);

  const pendingReviewCount = useMemo(() => {
    return interviews.reduce((total, interview) => {
      const invitedCount = interview.candidateEmails?.length || 0;
      const submittedCount = attemptsByInterview.get(interview.id) || 0;
      return total + Math.max(invitedCount - submittedCount, 0);
    }, 0);
  }, [attemptsByInterview, interviews]);

  const activityData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buckets = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const dayKey = getLocalDayKey(day);

      return {
        dayKey,
        date: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        roles: 0,
        assessments: 0,
        responses: 0,
      };
    });

    const bucketMap = new Map(buckets.map((bucket) => [bucket.dayKey, bucket]));

    const incrementBucket = (
      value: TimestampLike,
      key: 'roles' | 'assessments' | 'responses'
    ) => {
      const millis = toMillis(value);
      if (!millis) return;

      const bucketDate = new Date(millis);
      bucketDate.setHours(0, 0, 0, 0);
      const dayKey = getLocalDayKey(bucketDate);
      const bucket = bucketMap.get(dayKey);
      if (bucket) bucket[key] += 1;
    };

    dashboardRoles.forEach((role) => incrementBucket(role.createdAt, 'roles'));
    tests.forEach((test) => incrementBucket(test.createdAt, 'assessments'));
    attempts.forEach((attempt) => incrementBucket(attempt.submittedAt, 'responses'));

    return buckets;
  }, [attempts, dashboardRoles, tests]);

  const hasActivity = activityData.some(
    (bucket) => bucket.roles > 0 || bucket.assessments > 0 || bucket.responses > 0
  );

  const loading = loadingJobs || loadingInterviews || loadingTests || loadingAttempts;

  const getRoleStatus = (role: DashboardRoleEntry) => {
    const deadlineMillis = toMillis(role.deadline);
    if (deadlineMillis && deadlineMillis < Date.now()) {
      return {
        label: 'Expired',
        className:
          'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20',
      };
    }

    return {
      label: 'Active',
      className:
        'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20',
    };
  };

  const handleDelete = (role: DashboardRoleEntry) => {
    messageBox.showConfirm('Are you sure you want to delete this role?', async () => {
      try {
        const deletions: Promise<void>[] = [];

        if (role.hasJobDoc) {
          deletions.push(deleteDoc(doc(db, 'jobs', role.id)));
        }

        if (role.hasInterviewDoc) {
          deletions.push(deleteDoc(doc(db, 'interviews', role.id)));
        }

        await Promise.all(deletions);
      } catch (error) {
        console.error('Error deleting role:', error);
        messageBox.showError('Error deleting role');
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-gray-200 dark:border-white/5 dashboard-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Recruiter Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Live overview of your recruiter-owned roles, invites, responses, and assessments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/recruiter/interview/create"
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white dark:text-black font-semibold rounded-full shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm"
          >
            <i className="fas fa-video"></i> <span>Create Interview</span>
          </Link>
          <Link
            to="/recruiter/tests/create"
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 font-semibold rounded-full shadow-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm"
          >
            <i className="fas fa-clipboard-list text-blue-500"></i> <span>Create Assessment</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-colors shadow-sm dark:shadow-none kpi-card">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Jobs</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {dashboardRoles.length}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
              <i className="fas fa-briefcase"></i>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-colors shadow-sm dark:shadow-none kpi-card">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Interviews</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {interviews.length}
              </h3>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
              <i className="fas fa-users"></i>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-colors shadow-sm dark:shadow-none kpi-card">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Pending Review</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {pendingReviewCount}
              </h3>
            </div>
            <div className="p-3 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-xl">
              <i className="fas fa-clock"></i>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-colors shadow-sm dark:shadow-none kpi-card">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Reviewed Interviews</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {attempts.length}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
              <i className="fas fa-check-double"></i>
            </div>
          </div>
        </div>

        <Link
          to="/recruiter/tests"
          className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-colors shadow-sm dark:shadow-none kpi-card"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Assessments</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{tests.length}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Open test manager</p>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 rounded-xl">
              <i className="fas fa-clipboard-list"></i>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none analytics-card">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recruitment Activity</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Live graph of role creation, assessments, and candidate responses over the last 7 days.
            </p>
          </div>
          <div className="h-[300px] w-full">
            {hasActivity ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData} margin={{ left: -16, right: 8, top: 12 }}>
                  <defs>
                    <linearGradient id="rolesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="assessmentsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="responsesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    vertical={false}
                    className="dark:stroke-[#333]"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, #111827)',
                      border: '1px solid var(--tooltip-border, #374151)',
                      borderRadius: '12px',
                      color: 'var(--tooltip-text, #fff)',
                    }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        roles: 'Roles',
                        assessments: 'Assessments',
                        responses: 'Responses',
                      };
                      return [value, labels[name] || name];
                    }}
                    itemStyle={{ color: 'var(--tooltip-text, #fff)' }}
                  />
                  <Legend
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        roles: 'Roles',
                        assessments: 'Assessments',
                        responses: 'Responses',
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="roles"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#rolesGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="assessments"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#assessmentsGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="responses"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#responsesGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02] text-center px-6">
                <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                  <i className="fas fa-chart-area text-xl"></i>
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">No live activity yet</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md">
                  Create an interview, sync a job post, or publish an assessment and the graph will update here automatically.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111] p-4 md:p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none analytics-card overflow-hidden">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Live Pipeline</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Real-time view of your interview flow, invite backlog, and assessments.
            </p>
          </div>
          <div className="space-y-4">
            <Link
              to="/recruiter/interviews"
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Manage Interviews</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {interviews.length} live workflow(s) and {attempts.length} response report(s).
                </p>
              </div>
              <i className="fas fa-arrow-right text-gray-400"></i>
            </Link>
            <Link
              to="/recruiter/invites"
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm transition-colors hover:border-green-300 hover:bg-green-50 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-green-500/30 dark:hover:bg-green-500/10"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Track Invites</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {totalInvites} total invite(s), {pendingReviewCount} still awaiting candidate submission.
                </p>
              </div>
              <i className="fas fa-arrow-right text-gray-400"></i>
            </Link>
            <Link
              to="/recruiter/tests"
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm transition-colors hover:border-purple-300 hover:bg-purple-50 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-purple-500/30 dark:hover:bg-purple-500/10"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Manage Assessments</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {tests.length} assessment(s) with {tests.reduce((sum, test) => sum + (test.questions?.length || 0), 0)} total question(s).
                </p>
              </div>
              <i className="fas fa-arrow-right text-gray-400"></i>
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8 jobs-table-section">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Existing Job Posts</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Interview-created roles and synced job posts appear here automatically.
            </p>
          </div>
        </div>

        {dashboardRoles.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 border-dashed">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-500">
              <i className="fas fa-clipboard-list text-2xl"></i>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              No recruiter-owned roles are live yet. New interviews and synced job posts will show up here in real time.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/recruiter/interview/create"
                className="text-primary font-medium hover:underline hover:text-primary-light transition-colors"
              >
                Create your first interview
              </Link>
              <Link
                to="/recruiter/tests/create"
                className="text-primary font-medium hover:underline hover:text-primary-light transition-colors"
              >
                Create your first assessment
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-sm dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-white/5">
                <thead className="bg-gray-50 dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Job Title
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Posted Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Deadline
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-white/5">
                  {dashboardRoles.map((role) => {
                    const roleStatus = getRoleStatus(role);

                    return (
                      <tr
                        key={role.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors">
                            {role.title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {role.category || role.companyName || role.location}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-medium rounded-full bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                            {role.sourceLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(role.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {role.deadline ? formatDate(role.deadline) : 'Open'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-medium rounded-full ${roleStatus.className}`}
                          >
                            {roleStatus.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                          <button
                            onClick={() => setEditingJobId(role.id)}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Edit"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDelete(role)}
                            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editingJobId && <EditJobModal jobId={editingJobId} onClose={() => setEditingJobId(null)} />}
    </div>
  );
};

export default RecruiterDashboard;
