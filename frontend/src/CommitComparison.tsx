import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Plus, Minus, FileText, Loader } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

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

interface LastCommitData {
  org: string;
  repo: string;
  pr_number: number;
  lastCommit: {
    commit_sha: string;
    commit_message: string;
    author_name: string;
    author_email: string;
    committed_at: string;
    total_additions: number;
    total_deletions: number;
    total_changed_files: number;
  };
  files_changed: FileChange[];
}

interface CommitComparisonProps {
  org: string;
  repo: string;
  prNumber: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function CommitComparison({ org, repo, prNumber }: CommitComparisonProps) {
  const [lastCommitData, setLastCommitData] = useState<LastCommitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchLastCommitData();
  }, [org, repo, prNumber]);

  const fetchLastCommitData = async () => {
    try {
      setLoading(true);
      // NEW: Fetch only last commit data
      const response = await fetch(
        `${API_URL}/api/pr/last-commit/${org}/${repo}/${prNumber}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch last commit data');
      }

      const data = await response.json();
      setLastCommitData(data);
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

  const getLanguageFromFilename = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'py':
        return 'python';
      case 'js':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'tsx':
        return 'tsx';
      case 'jsx':
        return 'jsx';
      case 'java':
        return 'java';
      case 'sql':
        return 'sql';
      case 'yml':
      case 'yaml':
        return 'yaml';
      case 'json':
        return 'json';
      case 'sh':
      case 'bash':
        return 'bash';
      case 'md':
        return 'markdown';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      default:
        return 'text';
    }
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

  if (!lastCommitData) {
    return (
      <div className="text-center py-8 text-slate-500">
        No commit data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats - Last Commit Only */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-emerald-700 text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> Additions
          </p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">
            {lastCommitData.lastCommit.total_additions}
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm font-medium flex items-center gap-2">
            <Minus className="w-4 h-4" /> Deletions
          </p>
          <p className="text-3xl font-bold text-red-700 mt-2">
            {lastCommitData.lastCommit.total_deletions}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-700 text-sm font-medium">Files Changed</p>
          <p className="text-3xl font-bold text-blue-700 mt-2">
            {lastCommitData.lastCommit.total_changed_files}
          </p>
        </div>
      </div>

      {/* Last Commit Info Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Last Commit
        </h3>

        <div className="border border-slate-200 rounded-lg p-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500">SHA</p>
              <p className="text-sm font-mono text-slate-700">
                {lastCommitData.lastCommit.commit_sha.slice(0, 7)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Author</p>
              <p className="text-sm text-slate-700">{lastCommitData.lastCommit.author_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Date</p>
              <p className="text-sm text-slate-700">
                {new Date(lastCommitData.lastCommit.committed_at).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Message</p>
              <p className="text-sm text-slate-700 line-clamp-3">
                {lastCommitData.lastCommit.commit_message}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Files Changed Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Files Changed ({lastCommitData.files_changed.length})
        </h3>

        <div className="space-y-3">
          {lastCommitData.files_changed.map((file, idx) => (
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
                  <SyntaxHighlighter
                    style={oneLight}
                    language={getLanguageFromFilename(file.filename)}
                    showLineNumbers
                    wrapLongLines
                    customStyle={{
                      margin: 0,
                      borderRadius: 8,
                      fontSize: '0.75rem',
                      maxHeight: '20rem',
                      overflow: 'auto',
                      padding: '1rem',
                    }}
                  >
                    {file.patch}
                  </SyntaxHighlighter>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>


    </div>
  );
}

