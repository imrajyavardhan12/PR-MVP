import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Plus, Minus, FileText, Loader } from 'lucide-react';

interface CommitData {
  commit_sha: string;
  commit_message: string;
  author_name: string;
  committed_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
}

interface FileChange {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
  patch?: string;
}

interface CommitDiff {
  first_commit_sha: string;
  last_commit_sha: string;
  total_additions: number;
  total_deletions: number;
  total_changed_files: number;
  files_changed: FileChange[];
  summary?: string;
}

interface CommitComparisonProps {
  org: string;
  repo: string;
  prNumber: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function CommitComparison({ org, repo, prNumber }: CommitComparisonProps) {
  const [commits, setCommits] = useState<CommitData[]>([]);
  const [commitDiff, setCommitDiff] = useState<CommitDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCommitData();
  }, [org, repo, prNumber]);

  const fetchCommitData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/pr/commits/${org}/${repo}/${prNumber}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch commit data');
      }

      const data = await response.json();
      setCommits(data.commits || []);
      setCommitDiff(data.commitDiff || null);
    } catch (err: any) {
      setError(err.message || 'Error loading commit data');
    } finally {
      setLoading(false);
    }
  };

  const toggleFileExpand = (filename: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filename)) {
        newSet.delete(filename);
      } else {
        newSet.add(filename);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'added':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'removed':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'modified':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'renamed':
        return 'bg-purple-50 border-purple-200 text-purple-700';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  const extractModificationSummary = (patch: string | undefined): string => {
    if (!patch) return 'No changes';
    
    const lines = patch.split('\n');
    const changes: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const text = line.slice(1, 70).trim();
        if (text.length > 0) changes.push(text);
      }
      if (changes.length >= 2) break;
    }
    
    return changes.length > 0 ? changes.join(' ... ') : 'Modified';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-600">Loading commit data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  if (!commitDiff || commits.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No commit data available
      </div>
    );
  }

  const firstCommit = commits[0];
  const lastCommit = commits[commits.length - 1];

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-slate-600 text-sm font-medium">Total Commits</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{commits.length}</p>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-emerald-700 text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> Additions
          </p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">
            {commitDiff.total_additions}
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm font-medium flex items-center gap-2">
            <Minus className="w-4 h-4" /> Deletions
          </p>
          <p className="text-3xl font-bold text-red-700 mt-2">
            {commitDiff.total_deletions}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-700 text-sm font-medium">Files Changed</p>
          <p className="text-3xl font-bold text-blue-700 mt-2">
            {commitDiff.total_changed_files}
          </p>
        </div>
      </div>

      {/* First vs Last Commit Comparison */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          First vs Last Commit
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* First Commit */}
          <div className="border border-slate-200 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-600 mb-3">First Commit</p>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500">SHA</p>
                <p className="text-sm font-mono text-slate-700">
                  {firstCommit.commit_sha.slice(0, 7)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Author</p>
                <p className="text-sm text-slate-700">{firstCommit.author_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Date</p>
                <p className="text-sm text-slate-700">
                  {new Date(firstCommit.committed_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Message</p>
                <p className="text-sm text-slate-700 line-clamp-2">
                  {firstCommit.commit_message}
                </p>
              </div>
            </div>
          </div>

          {/* Last Commit */}
          <div className="border border-slate-200 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-600 mb-3">Last Commit</p>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500">SHA</p>
                <p className="text-sm font-mono text-slate-700">
                  {lastCommit.commit_sha.slice(0, 7)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Author</p>
                <p className="text-sm text-slate-700">{lastCommit.author_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Date</p>
                <p className="text-sm text-slate-700">
                  {new Date(lastCommit.committed_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Message</p>
                <p className="text-sm text-slate-700 line-clamp-2">
                  {lastCommit.commit_message}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Files Changed Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Files Changed ({commitDiff.files_changed.length})
        </h3>

        <div className="space-y-3">
          {commitDiff.files_changed.map((file, idx) => (
            <div
              key={idx}
              className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
            >
              {/* File Header */}
              <div
                className="cursor-pointer flex items-center justify-between"
                onClick={() => toggleFileExpand(file.filename)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {file.filename}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {extractModificationSummary(file.patch)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-emerald-700 font-semibold text-sm">
                      +{file.additions}
                    </span>
                    <span className="mx-2 text-slate-400">/</span>
                    <span className="text-red-700 font-semibold text-sm">
                      -{file.deletions}
                    </span>
                  </div>
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                      file.status
                    )}`}
                  >
                    {file.status}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
                      expandedFiles.has(file.filename) ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Expanded Patch View */}
              {expandedFiles.has(file.filename) && file.patch && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Code Changes:</p>
                  <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-auto max-h-80 font-mono">
                    {file.patch}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Commit Timeline */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          All Commits ({commits.length})
        </h3>

        <div className="space-y-2">
          {commits.map((commit, idx) => (
            <div
              key={idx}
              className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="pt-1">
                <div className="w-3 h-3 rounded-full bg-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-slate-600">
                    {commit.commit_sha.slice(0, 7)}
                  </span>
                  <span className="text-sm text-slate-700 truncate">
                    {commit.commit_message}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <span>{commit.author_name}</span>
                  <span>•</span>
                  <span>
                    {new Date(commit.committed_at).toLocaleDateString()}
                  </span>
                  <span>•</span>
                  <span className="text-emerald-600">+{commit.additions}</span>
                  <span className="text-red-600">-{commit.deletions}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Section */}
      {commitDiff.summary && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Summary</h3>
          <p className="text-blue-800 text-sm leading-relaxed">
            {commitDiff.summary}
          </p>
        </div>
      )}
    </div>
  );
}
