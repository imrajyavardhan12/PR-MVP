import { useState } from 'react';
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
}

function App() {
  const [prInput, setPrInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PRReport | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      // Parse input: format can be "org/repo#123" or separate inputs
      const match = prInput.match(/^(.+?)\/(.+?)#(\d+)$/);
      
      if (!match) {
        setError('Invalid format. Use: org/repo#pr_number (e.g., facebook/react#12345)');
        setLoading(false);
        return;
      }

      const [, org, repo, pr_number] = match;

      const response = await fetch('http://localhost:3000/api/pr/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org,
          repo,
          pr_number: parseInt(pr_number),
        }),
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            PR Analysis Tool
          </h1>
          <p className="text-gray-600 mb-6">
            Enter a GitHub Pull Request to generate an analysis report
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pr-input" className="block text-sm font-medium text-gray-700 mb-2">
                Pull Request
              </label>
              <input
                id="pr-input"
                type="text"
                value={prInput}
                onChange={(e) => setPrInput(e.target.value)}
                placeholder="org/repo#pr_number (e.g., facebook/react#12345)"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !prInput}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating Report...' : 'Generate Report'}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700">{error}</p>
            </div>
          )}
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="mb-6 pb-6 border-b border-gray-200">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {result.pr.title}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="font-medium">
                      {result.pr.org}/{result.pr.repo} #{result.pr.pr_number}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                      {result.pr.state}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Author:</span>
                  <span className="ml-2 font-medium">@{result.pr.author}</span>
                </div>
                <div>
                  <span className="text-gray-600">Created:</span>
                  <span className="ml-2">{formatDate(result.pr.created_at)}</span>
                </div>
              </div>

              {result.pr.description && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
                  <p className="text-gray-600 text-sm whitespace-pre-wrap">
                    {result.pr.description}
                  </p>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Analysis Report</h3>
                <span className="text-xs text-gray-500">
                  Generated: {formatDate(result.report.generated_at)}
                </span>
              </div>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {result.report.report_content}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
