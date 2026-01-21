import { useState, useEffect } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  ExternalLink,
  Clock,
  User,
  Github,
  Loader,
  AlertCircle,
} from 'lucide-react';

interface HistoryPR {
  id?: number;
  org: string;
  repo: string;
  pr_number: number;
  title: string;
  author: string;
  state: string;
  created_at: string;
  generated_at?: string;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function HistoryDashboard({ onSelectPR }: { onSelectPR: (pr: any) => void }) {
  const [prs, setPRs] = useState<HistoryPR[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRepo, setFilterRepo] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'generated_at' | 'created_at' | 'author'>('generated_at');
  const [showFilters, setShowFilters] = useState(false);

  const fetchPRs = async (page: number = 1, isSearch: boolean = false) => {
    setLoading(true);
    setError('');

    try {
      const hasActiveFilters =
        searchQuery || filterRepo || filterAuthor || filterState || filterStartDate || filterEndDate;

      const endpoint = isSearch || hasActiveFilters ? '/api/pr/history/search' : '/api/pr/history';
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
        sortBy,
        ...(searchQuery && { q: searchQuery }),
        ...(filterRepo && { repo: filterRepo }),
        ...(filterAuthor && { author: filterAuthor }),
        ...(filterState && { state: filterState }),
        ...(filterStartDate && { startDate: filterStartDate }),
        ...(filterEndDate && { endDate: filterEndDate }),
      });

      const response = await fetch(`${API_URL}${endpoint}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch PR history');

      const data = await response.json();
      setPRs(data.data);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPRs(1, true);
  }, [sortBy]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPRs(1, true);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterRepo('');
    setFilterAuthor('');
    setFilterState('');
    setFilterStartDate('');
    setFilterEndDate('');
    setSortBy('generated_at');
    setPagination({ ...pagination, page: 1 });
    fetchPRs(1, false);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by PR #, title, or author..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Search'}
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 rounded-lg border transition-colors flex items-center gap-2 ${
                showFilters
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
              <input
                type="text"
                value={filterRepo}
                onChange={(e) => setFilterRepo(e.target.value)}
                placeholder="Filter by repository..."
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="text"
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                placeholder="Filter by author..."
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All States</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="merged">Merged</option>
              </select>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Sort Options */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-600">Sort by:</span>
        </div>
        <div className="flex gap-2">
          {['generated_at', 'created_at', 'author'].map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option as any)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                sortBy === option
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option === 'generated_at' ? 'Analysis Date' : option === 'created_at' ? 'Created Date' : 'Author'}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : prs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Github className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No PRs Found</h3>
          <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prs.map((pr) => (
            <div
              key={`${pr.org}-${pr.repo}-${pr.pr_number}`}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <a
                      href={`https://github.com/${pr.org}/${pr.repo}/pull/${pr.pr_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                    >
                      {pr.org}/{pr.repo}#{pr.pr_number}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${getStateStyles(pr.state)}`}>
                      {pr.state}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 mb-3 truncate">{pr.title}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {pr.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(pr.created_at)}
                    </span>
                    {pr.generated_at && (
                      <span className="flex items-center gap-1 text-blue-600">
                        Analyzed: {formatDate(pr.generated_at)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onSelectPR(pr)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap ml-4"
                >
                  View Report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Showing{' '}
            <span className="font-medium">
              {(pagination.page - 1) * pagination.pageSize + 1}
            </span>
            {' '}to{' '}
            <span className="font-medium">
              {Math.min(pagination.page * pagination.pageSize, pagination.total)}
            </span>
            {' '}of{' '}
            <span className="font-medium">{pagination.total}</span>
            {' '}PRs
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchPRs(pagination.page - 1, true)}
              disabled={!pagination.hasPrevPage || loading}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }).map((_, i) => {
                const pageNum = Math.max(1, pagination.page - 2) + i;
                if (pageNum > pagination.totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => fetchPRs(pageNum, true)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      pageNum === pagination.page
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => fetchPRs(pagination.page + 1, true)}
              disabled={!pagination.hasNextPage || loading}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HistoryDashboard;
