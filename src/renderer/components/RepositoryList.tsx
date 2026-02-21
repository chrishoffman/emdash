import React from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Lock, Calendar, Download } from 'lucide-react';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  private: boolean;
  updated_at: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
}

interface RepositoryListProps {
  repositories: Repository[];
  onImportRepository: (repo: Repository) => void;
  onOpenRepository: (repo: Repository) => void;
}

const RepositoryList: React.FC<RepositoryListProps> = ({
  repositories,
  onImportRepository,
  onOpenRepository,
}) => {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getRepositoryIcon = (repo: Repository) => {
    // Simple icon based on repository name or language
    const firstLetter = repo.name.charAt(0).toUpperCase();
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-700 dark:text-gray-300">
        {firstLetter}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl text-center mb-2">Your Repositories</h2>
        <p className="text-sm text-gray-500 text-center">
          {repositories.length} repositories found
        </p>
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {repositories.map((repo) => (
          <Card 
            key={repo.id} 
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            onClick={() => onOpenRepository(repo)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {getRepositoryIcon(repo)}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {repo.name}
                    </h3>
                    {repo.private && (
                      <Lock className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                      {repo.description}
                    </p>
                  )}
                </div>
                
                {/* Date */}
                <div className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(repo.updated_at)}</span>
                </div>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                className="ml-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onImportRepository(repo);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Import
              </Button>
            </div>
          </Card>
        ))}
      </div>
      
      {repositories.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No repositories found</p>
        </div>
      )}
    </div>
  );
};

export default RepositoryList;