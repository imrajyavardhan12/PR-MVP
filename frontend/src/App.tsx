import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Search, 
  Download, 
  Copy, 
  CheckCircle2, 
  Github, 
  ExternalLink, 
  Clock, 
  User, 
  GitPullRequest,
  Sparkles,
  XCircle,
  X,
  Database,
  Zap,
  AlertCircle,
  CheckCircle,
  History,
  Share2,
  FileJson,
  FileText
} from 'lucide-react';
import HistoryDashboard from './HistoryDashboard';
import './App.css';

interface PRReport {
  pr: {
    org: string;
    repo: string;
    pr_number: number;
    title: string;
    description: string | null;
    author: string;
    state: string;
    created_at: string;
  };
  report: {
    report_content: string;
    generated_at: string;
  };
  cached?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const EXAMPLE_PRS = [
  '8451LLC/effoprice#21',
  '8451LLC/effoprice#62',
  '8451LLC/map-mdf-dlt-streaming#139',
];

interface BatchResult {
  org: string;
  repo: string;
  pr_number: number;
  success: boolean;
  pr?: any;
  report?: any;
  error?: string;
}

interface BatchProgress {
  batch_token: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_prs: number;
  completed_prs: number;
  progress_percentage: number;
  results: BatchResult[];
  error_message?: string;
}

function App() {
  const [tab, setTab] = useState<'single' | 'bulk' | 'history'>('single');
  const [prInput, setPrInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PRReport | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Bulk analysis state
  const [bulkInput, setBulkInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  
  // Export state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareExpiresIn, setShareExpiresIn] = useState<'1d' | '7d' | '30d' | 'never'>('7d');
  const [sharePassword, setSharePassword] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      let org: string, repo: string, pr_number: string;

      const urlMatch = prInput.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
      const urlNoPullMatch = prInput.match(/github\.com\/([^\/]+)\/([^\/]+)\/(\d+)$/);
      const mixedMatch = prInput.match(/github\.com\/([^\/]+)\/([^#]+)#(\d+)/);
      const shortMatch = prInput.match(/^([^\/]+)\/([^#]+)#(\d+)$/);

      if (urlMatch) {
        [, org, repo, pr_number] = urlMatch;
      } else if (urlNoPullMatch) {
        [, org, repo, pr_number] = urlNoPullMatch;
      } else if (mixedMatch) {
        [, org, repo, pr_number] = mixedMatch;
      } else if (shortMatch) {
        [, org, repo, pr_number] = shortMatch;
      } else {
        setError('Invalid format. Use: org/repo#pr_number or full GitHub PR URL');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/pr/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org, repo, pr_number: parseInt(pr_number) }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.report.report_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExampleClick = (example: string) => {
    setPrInput(example);
  };

  const clearInput = () => {
    setPrInput('');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStateStyles = (state: string) => {
    switch (state.toLowerCase()) {
      case 'open':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'closed':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'merged':
        return 'bg-violet-50 text-violet-700 border-violet-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError('');
    setBatchToken(null);
    setBatchProgress(null);
    setBatchResults([]);
    setBulkLoading(true);

    try {
      const lines = bulkInput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) {
        setBulkError('Please enter at least one PR');
        setBulkLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr_list: lines }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start batch analysis');
      }

      const data = await response.json();
      
      // Start polling for progress
      pollBatchProgress(data.batch_token);
    } catch (err: any) {
      setBulkError(err.message || 'An error occurred');
      setBulkLoading(false);
    }
  };

  const pollBatchProgress = async (token: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/batch/${token}`);
        if (!response.ok) throw new Error('Failed to fetch batch progress');

        const progress: BatchProgress = await response.json();
        setBatchProgress(progress);
        setBatchResults(progress.results);

        if (progress.status === 'completed' || progress.status === 'failed') {
          clearInterval(interval);
          setBulkLoading(false);
        }
      } catch (err) {
        console.error('Polling error:', err);
        clearInterval(interval);
      }
    }, 2000); // Poll every 2 seconds
  };

  const handleExport = async (format: 'markdown' | 'json' | 'html') => {
    if (!result) return;
    try {
      const response = await fetch(
        `${API_URL}/api/pr/export/${result.pr.org}/${result.pr.repo}/${result.pr.pr_number}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format }),
        }
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const ext = format === 'markdown' ? 'md' : format;
      a.download = `pr-${result.pr.org}-${result.pr.repo}-${result.pr.pr_number}-analysis.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleCreateShare = async () => {
    if (!result) return;
    setShareLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/pr/share/${result.pr.org}/${result.pr.repo}/${result.pr.pr_number}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expiresIn: shareExpiresIn,
            password: sharePassword || null,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to create share');

      const data = await response.json();
      setShareUrl(data.share_url);
      setSharePassword('');
    } catch (err) {
      console.error('Share error:', err);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShare = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-semibold text-gray-800 mb-1">
            PR Analysis Dashboard
          </h1>
          <p className="text-gray-500 text-sm">
            AI-powered insights for GitHub pull requests - Analyze discussions, reviews, and learnings
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="mb-8 border-b border-gray-200">
          <div className="flex gap-8">
            <button
              onClick={() => setTab('single')}
              className={`pb-4 px-2 font-medium text-sm transition-colors border-b-2 ${
                tab === 'single'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Single PR Analysis
              </span>
            </button>
            <button
              onClick={() => setTab('bulk')}
              className={`pb-4 px-2 font-medium text-sm transition-colors border-b-2 ${
                tab === 'bulk'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Bulk Analysis
              </span>
            </button>
            <button
              onClick={() => setTab('history')}
              className={`pb-4 px-2 font-medium text-sm transition-colors border-b-2 ${
                tab === 'history'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <History className="w-4 h-4" />
                PR History
              </span>
            </button>
          </div>
        </div>

        {/* Single PR Tab */}
        {tab === 'single' && (
         <>
         {/* Input Form with Examples */}
         <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-8">
           <form onSubmit={handleSubmit}>
            <label htmlFor="pr-input" className="block text-sm font-medium text-gray-700 mb-2">
              Pull Request
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="pr-input"
                  type="text"
                  value={prInput}
                  onChange={(e) => setPrInput(e.target.value)}
                  placeholder="owner/repo#123 or GitHub PR URL"
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                  disabled={loading}
                />
                {prInput && !loading && (
                  <button
                    type="button"
                    onClick={clearInput}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !prInput}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing
                  </span>
                ) : (
                  'Analyze'
                )}
              </button>
            </div>
          </form>

          {/* Example PRs */}
          {!result && !loading && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PRS.map((example) => (
                  <button
                    key={example}
                    onClick={() => handleExampleClick(example)}
                    className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {/* PR Details Card */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">
                  Pull Request Details
                </h2>
                {result.cached && (
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    <Database className="w-3.5 h-3.5" />
                    Cached
                  </span>
                )}
              </div>
              <table className="w-full">
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-6 py-3 text-sm text-slate-500 w-40">Title</td>
                    <td className="px-6 py-3 text-sm text-slate-800 font-medium">{result.pr.title}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm text-slate-500">Repository</td>
                    <td className="px-6 py-3 text-sm">
                      <a
                        href={`https://github.com/${result.pr.org}/${result.pr.repo}/pull/${result.pr.pr_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline group"
                      >
                        <Github className="w-4 h-4" />
                        {result.pr.org}/{result.pr.repo}#{result.pr.pr_number}
                        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm text-slate-500">Author</td>
                    <td className="px-6 py-3 text-sm">
                      <a
                        href={`https://github.com/${result.pr.author}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 hover:underline group"
                      >
                        <User className="w-4 h-4" />
                        @{result.pr.author}
                        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm text-slate-500">Status</td>
                    <td className="px-6 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${getStateStyles(result.pr.state)}`}>
                        {result.pr.state}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm text-slate-500">Created</td>
                    <td className="px-6 py-3 text-sm text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {formatDate(result.pr.created_at)}
                    </td>
                  </tr>
                  {result.pr.description && (
                    <tr>
                      <td className="px-6 py-3 text-sm text-slate-500 align-top">Description</td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        <div className="prose prose-sm prose-slate max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {result.pr.description}
                          </ReactMarkdown>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Analysis Report */}
             <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
               <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                 <div>
                   <h2 className="text-lg font-semibold text-gray-800">
                     AI Analysis Report
                   </h2>
                   <span className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                     <Clock className="w-3 h-3" />
                     Generated {formatDate(result.report.generated_at)}
                   </span>
                 </div>
                 <div className="flex items-center gap-2">
                   <button
                     onClick={handleCopy}
                     className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                     title="Copy to clipboard"
                   >
                     {copied ? (
                       <>
                         <CheckCircle2 className="w-4 h-4 text-green-600" />
                         <span className="text-green-600">Copied!</span>
                       </>
                     ) : (
                       <>
                         <Copy className="w-4 h-4" />
                         Copy
                       </>
                     )}
                   </button>
                   
                   {/* Export Menu */}
                   <div className="relative">
                     <button
                       onClick={() => setShowExportMenu(!showExportMenu)}
                       className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                       title="Export report"
                     >
                       <Download className="w-4 h-4" />
                       Export
                     </button>
                     {showExportMenu && (
                       <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                         <button
                           onClick={() => handleExport('markdown')}
                           className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 border-b border-gray-100"
                         >
                           <FileText className="w-4 h-4" />
                           Markdown (.md)
                         </button>
                         <button
                           onClick={() => handleExport('json')}
                           className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 border-b border-gray-100"
                         >
                           <FileJson className="w-4 h-4" />
                           JSON (.json)
                         </button>
                         <button
                           onClick={() => handleExport('html')}
                           className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                         >
                           <FileText className="w-4 h-4" />
                           HTML (.html)
                         </button>
                       </div>
                     )}
                   </div>

                   {/* Share Button */}
                   <button
                     onClick={() => setShowShareModal(!showShareModal)}
                     className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                     title="Create shareable link"
                   >
                     <Share2 className="w-4 h-4" />
                     Share
                   </button>
                 </div>
               </div>
              <div className="px-8 py-6">
                <div className="prose prose-slate max-w-none
                  prose-headings:text-slate-800 prose-headings:font-semibold
                  prose-h1:text-xl prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-2 prose-h1:mb-4
                  prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3
                  prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                  prose-p:text-slate-600 prose-p:leading-relaxed
                  prose-strong:text-slate-800
                  prose-ul:text-slate-600 prose-ol:text-slate-600
                  prose-li:my-1
                  prose-a:text-slate-700 prose-a:underline prose-a:underline-offset-2
                  prose-code:text-slate-700 prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-pre:rounded-lg prose-pre:overflow-x-auto
                  prose-blockquote:border-l-slate-300 prose-blockquote:text-slate-600 prose-blockquote:not-italic
                  prose-table:border prose-table:border-slate-200 prose-table:w-full
                  prose-th:bg-slate-50 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:text-slate-700 prose-th:font-medium prose-th:border prose-th:border-slate-200
                  prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-slate-200 prose-td:text-slate-600
                ">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match && !className;
                        
                        return !isInline && match ? (
                          <SyntaxHighlighter
                            style={oneLight}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              borderRadius: '0.5rem',
                              fontSize: '0.875rem',
                            }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {result.report.report_content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!result && !loading && (
          <div className="text-center py-20">
            <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <GitPullRequest className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No PR Analysis Yet</h3>
            <p className="text-gray-500 text-sm mb-6">
              Enter a GitHub Pull Request URL or shorthand above to generate an AI-powered analysis
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                AI-Powered
              </span>
              <span className="flex items-center gap-1">
                <Database className="w-4 h-4" />
                Cached Results
              </span>
            </div>
          </div>
        )}
        </>
        )}

        {/* Bulk PR Tab */}
        {tab === 'bulk' && (
         <>
         {/* Bulk Input Form */}
         <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-8">
           <form onSubmit={handleBulkSubmit}>
             <label htmlFor="bulk-input" className="block text-sm font-medium text-gray-700 mb-2">
               Pull Requests (one per line)
             </label>
             <textarea
               id="bulk-input"
               value={bulkInput}
               onChange={(e) => setBulkInput(e.target.value)}
               placeholder="facebook/react#31479&#10;microsoft/vscode#200000&#10;https://github.com/vercel/next.js/pull/60000"
               className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all font-mono text-sm resize-none"
               disabled={bulkLoading}
               rows={8}
             />
             <div className="mt-4 flex items-center justify-between">
               <p className="text-xs text-gray-500">
                 Supports: owner/repo#123, GitHub URLs, or mixed formats
               </p>
               <button
                 type="submit"
                 disabled={bulkLoading || !bulkInput.trim()}
                 className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
               >
                 {bulkLoading ? (
                   <span className="flex items-center gap-2">
                     <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                     </svg>
                     Analyzing ({batchProgress?.completed_prs}/{batchProgress?.total_prs})
                   </span>
                 ) : (
                   'Start Batch Analysis'
                 )}
               </button>
             </div>
           </form>

           {bulkError && (
             <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
               <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
               <p className="text-red-700 text-sm">{bulkError}</p>
             </div>
           )}
         </div>

         {/* Progress Bar */}
         {batchProgress && (
           <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-8">
             <div className="mb-4">
               <div className="flex items-center justify-between mb-2">
                 <h3 className="text-sm font-medium text-gray-700">
                   Batch Progress
                 </h3>
                 <span className="text-sm font-medium text-gray-600">
                   {batchProgress.completed_prs}/{batchProgress.total_prs}
                 </span>
               </div>
               <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                 <div
                   className="bg-blue-600 h-2 transition-all duration-300"
                   style={{ width: `${batchProgress.progress_percentage}%` }}
                 />
               </div>
               <p className="text-xs text-gray-500 mt-2">
                 {batchProgress.progress_percentage}% complete
               </p>
             </div>

             {batchProgress.status === 'completed' && (
               <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
                 <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                 <p className="text-emerald-700 text-sm">All PRs analyzed successfully</p>
               </div>
             )}
             {batchProgress.status === 'failed' && (
               <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                 <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                 <div>
                   <p className="text-red-700 text-sm font-medium">Batch Failed</p>
                   <p className="text-red-600 text-xs mt-1">{batchProgress.error_message}</p>
                 </div>
               </div>
             )}
           </div>
         )}

         {/* Results */}
         {batchResults.length > 0 && (
           <div className="space-y-4">
             <div className="flex items-center justify-between">
               <h2 className="text-lg font-semibold text-gray-800">
                 Batch Results
               </h2>
               <div className="flex gap-2">
                 <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                   {batchResults.filter((r) => r.success).length} Successful
                 </span>
                 {batchResults.filter((r) => !r.success).length > 0 && (
                   <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                     {batchResults.filter((r) => !r.success).length} Failed
                   </span>
                 )}
               </div>
             </div>

             <div className="grid gap-4">
               {batchResults.map((result, idx) => (
                 <div
                   key={idx}
                   className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                 >
                   <div className="flex items-start justify-between">
                     <div className="flex items-start gap-3 flex-1">
                       {result.success ? (
                         <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                       ) : (
                         <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                       )}
                       <div className="flex-1">
                         <p className="text-sm font-medium text-gray-800">
                           <a
                             href={`https://github.com/${result.org}/${result.repo}/pull/${result.pr_number}`}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="text-blue-600 hover:underline"
                           >
                             {result.org}/{result.repo}#{result.pr_number}
                           </a>
                         </p>
                         {result.success && result.pr && (
                           <p className="text-xs text-gray-600 mt-1">{result.pr.title}</p>
                         )}
                         {!result.success && result.error && (
                           <p className="text-xs text-red-600 mt-1">{result.error}</p>
                         )}
                       </div>
                     </div>
                     {result.success && result.report && (
                       <a
                         href={`#`}
                         onClick={() => {
                           setResult({
                             pr: result.pr!,
                             report: result.report!,
                             cached: false,
                           });
                           setTab('single');
                         }}
                         className="text-xs text-blue-600 hover:underline whitespace-nowrap ml-4"
                       >
                         View Report
                       </a>
                     )}
                   </div>
                 </div>
               ))}
             </div>
           </div>
         )}
         </>
        )}

        {/* Share Modal */}
        {showShareModal && result && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
             <div className="flex items-center justify-between mb-6">
               <h3 className="text-lg font-semibold text-gray-800">Create Shareable Link</h3>
               <button
                 onClick={() => {
                   setShowShareModal(false);
                   setShareUrl('');
                 }}
                 className="text-gray-400 hover:text-gray-600"
               >
                 <X className="w-5 h-5" />
               </button>
             </div>

             {shareUrl ? (
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Shareable Link</label>
                   <div className="flex gap-2">
                     <input
                       type="text"
                       value={shareUrl}
                       readOnly
                       className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700"
                     />
                     <button
                       onClick={handleCopyShare}
                       className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                     >
                       {shareCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                     </button>
                   </div>
                 </div>
                 <button
                   onClick={() => {
                     setShowShareModal(false);
                     setShareUrl('');
                   }}
                   className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                 >
                   Done
                 </button>
               </div>
             ) : (
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Expires In</label>
                   <select
                     value={shareExpiresIn}
                     onChange={(e) => setShareExpiresIn(e.target.value as any)}
                     className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                   >
                     <option value="1d">1 Day</option>
                     <option value="7d">7 Days</option>
                     <option value="30d">30 Days</option>
                     <option value="never">Never</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Password (Optional)</label>
                   <input
                     type="password"
                     value={sharePassword}
                     onChange={(e) => setSharePassword(e.target.value)}
                     placeholder="Leave empty for no password"
                     className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                   />
                 </div>
                 <div className="flex gap-2">
                   <button
                     onClick={handleCreateShare}
                     disabled={shareLoading}
                     className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                   >
                     {shareLoading ? 'Creating...' : 'Create Link'}
                   </button>
                   <button
                     onClick={() => setShowShareModal(false)}
                     className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                   >
                     Cancel
                   </button>
                 </div>
               </div>
             )}
           </div>
         </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
         <>
         <HistoryDashboard 
           onSelectPR={(pr) => {
             // Fetch the full report for this PR
             fetch(`${API_URL}/api/pr/report/${pr.org}/${pr.repo}/${pr.pr_number}`)
               .then(res => res.json())
               .then(data => {
                 setResult({
                   pr: data.pr,
                   report: data.report,
                   cached: true
                 });
                 setTab('single');
               })
               .catch(err => console.error('Failed to load PR report:', err));
           }}
         />
         </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <p className="flex items-center gap-2">
              Made with <span className="text-red-500">♥</span> by <span className="font-medium text-gray-700">Rajyavardhan</span>
            </p>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                Powered by OpenAI
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <Github className="w-3.5 h-3.5" />
                GitHub API
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;