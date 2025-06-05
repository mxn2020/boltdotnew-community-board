import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { MessageSquare, Plus, ThumbsUp, User, Calendar, Tag, Filter, Search, Share, Bookmark, Flag, MessageSquareOff, Sparkles, Lightbulb, Code, Rocket, Trophy } from 'lucide-react';

// Types for community board
interface CommunityPost {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  likes: number;
  comments: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
}

interface Comment {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  likes: number;
}

const CommunityBoardPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showNewPostDialog, setShowNewPostDialog] = useState(false);
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    category: 'question',
    tags: [] as string[],
  });
  const [newTag, setNewTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Categories for community posts - hackathon specific
  const categories = [
    { value: 'question', label: 'Question', icon: <MessageSquare className="h-4 w-4" /> },
    { value: 'idea', label: 'Project Idea', icon: <Lightbulb className="h-4 w-4" /> },
    { value: 'showcase', label: 'Project Showcase', icon: <Rocket className="h-4 w-4" /> },
    { value: 'resource', label: 'Resource', icon: <Code className="h-4 w-4" /> },
    { value: 'team', label: 'Team Formation', icon: <User className="h-4 w-4" /> },
    { value: 'announcement', label: 'Announcement', icon: <Sparkles className="h-4 w-4" /> },
  ];

  // Popular tags for hackathon
  const popularTags = [
    'ai', 'web3', 'react', 'nextjs', 'typescript', 'design', 'mobile', 'beginner',
    'frontend', 'backend', 'fullstack', 'database', 'ui/ux', 'blockchain', 'api',
    'saas', 'productivity', 'education', 'health', 'fintech', 'gaming'
  ];

  // Fetch posts from the API
  const fetchPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));
      if (activeTab === 'bookmarks') params.append('bookmarked', 'true');
      
      const response = await api.get(`/community?${params.toString()}`);
      
      if (response.data.success) {
        setPosts(response.data.data || []);
      } else {
        setError(response.data.error || 'Failed to load community posts');
      }
    } catch (err) {
      console.error('Error fetching community posts:', err);
      setError('Failed to load community posts. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch comments for a specific post
  const fetchComments = async (postId: string) => {
    if (!postId) return;
    
    try {
      setLoadingComments(true);
      const response = await api.get(`/community/${postId}/comments`);
      
      if (response.data.success) {
        setComments(response.data.data || []);
      } else {
        console.error('Failed to load comments:', response.data.error);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  // Handle creating a new post
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPost.title.trim() || !newPost.content.trim()) {
      return;
    }
    
    try {
      setSubmitting(true);
      
      const response = await api.post('/community', {
        title: newPost.title.trim(),
        content: newPost.content.trim(),
        category: newPost.category,
        tags: newPost.tags,
      });
      
      if (response.data.success) {
        // Add the new post to the list
        setPosts(prevPosts => [response.data.data, ...prevPosts]);
        
        // Reset form and close dialog
        setNewPost({
          title: '',
          content: '',
          category: 'question',
          tags: [],
        });
        setShowNewPostDialog(false);
      } else {
        setError(response.data.error || 'Failed to create post');
      }
    } catch (err) {
      console.error('Error creating post:', err);
      setError('Failed to create post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle adding a comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim() || !currentPostId) {
      return;
    }
    
    try {
      setSubmittingComment(true);
      
      const response = await api.post(`/community/${currentPostId}/comments`, {
        content: newComment.trim(),
      });
      
      if (response.data.success) {
        // Add the new comment to the list
        setComments(prevComments => [...prevComments, response.data.data]);
        
        // Update the comment count on the post
        setPosts(prevPosts => 
          prevPosts.map(post => 
            post.id === currentPostId 
              ? { ...post, comments: post.comments + 1 } 
              : post
          )
        );
        
        // Reset form
        setNewComment('');
      } else {
        console.error('Failed to add comment:', response.data.error);
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  // Toggle like on a post
  const handleLikePost = async (postId: string) => {
    if (!isAuthenticated) return;
    
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;
      
      // Optimistically update UI
      setPosts(prevPosts => 
        prevPosts.map(p => 
          p.id === postId 
            ? { 
                ...p, 
                likes: p.isLiked ? p.likes - 1 : p.likes + 1,
                isLiked: !p.isLiked 
              } 
            : p
        )
      );
      
      // Send API request
      await api.post(`/community/${postId}/like`, {
        action: post.isLiked ? 'unlike' : 'like'
      });
      
    } catch (err) {
      console.error('Error liking post:', err);
      // Revert optimistic update on error
      fetchPosts();
    }
  };

  // Toggle bookmark on a post
  const handleBookmarkPost = async (postId: string) => {
    if (!isAuthenticated) return;
    
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;
      
      // Optimistically update UI
      setPosts(prevPosts => 
        prevPosts.map(p => 
          p.id === postId 
            ? { ...p, isBookmarked: !p.isBookmarked } 
            : p
        )
      );
      
      // Send API request
      await api.post(`/community/${postId}/bookmark`, {
        action: post.isBookmarked ? 'unbookmark' : 'bookmark'
      });
      
    } catch (err) {
      console.error('Error bookmarking post:', err);
      // Revert optimistic update on error
      fetchPosts();
    }
  };

  // Handle adding a tag to the new post
  const handleAddTag = () => {
    if (newTag.trim() && !newPost.tags.includes(newTag.trim())) {
      setNewPost({
        ...newPost,
        tags: [...newPost.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  // Handle removing a tag from the new post
  const handleRemoveTag = (tagToRemove: string) => {
    setNewPost({
      ...newPost,
      tags: newPost.tags.filter(tag => tag !== tagToRemove)
    });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Load posts when component mounts or filters change
  useEffect(() => {
    fetchPosts();
  }, [activeTab, searchTerm, selectedCategory, selectedTags]);

  // Load comments when a post is selected
  useEffect(() => {
    if (currentPostId) {
      fetchComments(currentPostId);
    }
  }, [currentPostId]);

  // Get category label from value
  const getCategoryLabel = (value: string) => {
    return categories.find(cat => cat.value === value)?.label || value;
  };

  // Get category icon from value
  const getCategoryIcon = (value: string) => {
    return categories.find(cat => cat.value === value)?.icon || <MessageSquare className="h-4 w-4" />;
  };

  // Get category color based on category value
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'question':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'idea':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'showcase':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'resource':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'team':
        return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300';
      case 'announcement':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-yellow-600 dark:from-amber-200 dark:to-yellow-500">
            Hackathon Community
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect with other participants, share ideas, and find team members
          </p>
        </div>
        
        {isAuthenticated ? (
          <Button 
            onClick={() => setShowNewPostDialog(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-600 hover:from-amber-500 hover:to-yellow-700 text-black font-medium"
          >
            <Plus className="h-4 w-4" />
            New Post
          </Button>
        ) : (
          <Link to="/login">
            <Button variant="outline" className="border-amber-400 text-amber-400 hover:bg-amber-400/10">
              Sign in to post
            </Button>
          </Link>
        )}
      </div>

      {/* Filters and Search */}
      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search posts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-gray-800/50 border-gray-700 focus:border-amber-500"
            />
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-[180px] bg-gray-800/50 border-gray-700">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category.value} value={category.value} className="flex items-center gap-2">
                  {category.icon}
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" className="flex items-center gap-2 border-gray-700 bg-gray-800/50">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>
        
        {/* Popular Tags */}
        <div className="mt-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Popular Tags:</p>
          <div className="flex flex-wrap gap-2">
            {popularTags.map(tag => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className={`cursor-pointer ${selectedTags.includes(tag) ? 'bg-amber-500 hover:bg-amber-600 text-black' : 'border-gray-700 hover:border-amber-500'}`}
                onClick={() => {
                  if (selectedTags.includes(tag)) {
                    setSelectedTags(selectedTags.filter(t => t !== tag));
                  } else {
                    setSelectedTags([...selectedTags, tag]);
                  }
                }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs and Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 md:w-[400px] bg-gray-800/70 p-1">
          <TabsTrigger value="all" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">All Posts</TabsTrigger>
          <TabsTrigger value="popular" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">Popular</TabsTrigger>
          {isAuthenticated && (
            <TabsTrigger value="bookmarks" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">Bookmarks</TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="all" className="space-y-4">
          {renderPostsList()}
        </TabsContent>
        
        <TabsContent value="popular" className="space-y-4">
          {renderPostsList('popular')}
        </TabsContent>
        
        <TabsContent value="bookmarks" className="space-y-4">
          {renderPostsList('bookmarks')}
        </TabsContent>
      </Tabs>

      {/* New Post Dialog */}
      <Dialog open={showNewPostDialog} onOpenChange={setShowNewPostDialog}>
        <DialogContent className="sm:max-w-[600px] bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-amber-400">Create New Post</DialogTitle>
            <DialogDescription>
              Share your question, idea, or start a discussion with the hackathon community.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreatePost}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter a descriptive title"
                  value={newPost.title}
                  onChange={(e) => setNewPost({...newPost, title: e.target.value})}
                  required
                  className="bg-gray-800 border-gray-700"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={newPost.category} 
                  onValueChange={(value) => setNewPost({...newPost, category: value})}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {categories.map(category => (
                      <SelectItem key={category.value} value={category.value} className="flex items-center gap-2">
                        {category.icon}
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  placeholder="Share your question, idea, or start a discussion..."
                  rows={8}
                  value={newPost.content}
                  onChange={(e) => setNewPost({...newPost, content: e.target.value})}
                  required
                  className="bg-gray-800 border-gray-700"
                />
                <p className="text-xs text-muted-foreground">
                  Markdown formatting is supported.
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="tags">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="tags"
                    placeholder="Add a tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="bg-gray-800 border-gray-700"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddTag} 
                    disabled={!newTag.trim()}
                    className="bg-amber-500 hover:bg-amber-600 text-black"
                  >
                    Add
                  </Button>
                </div>
                
                {newPost.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {newPost.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="flex items-center gap-1 bg-amber-500/20 text-amber-300">
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 rounded-full hover:bg-amber-500/30"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewPostDialog(false)} className="border-gray-700">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={submitting}
                className="bg-gradient-to-r from-amber-400 to-yellow-600 hover:from-amber-500 hover:to-yellow-700 text-black font-medium"
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Posting...
                  </>
                ) : (
                  'Post'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Post Details Dialog */}
      <Dialog open={!!currentPostId} onOpenChange={(open) => !open && setCurrentPostId(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-800">
          {currentPostId && renderPostDetails()}
        </DialogContent>
      </Dialog>
    </div>
  );

  // Helper function to render the list of posts
  function renderPostsList(type: 'all' | 'popular' | 'bookmarks' = 'all') {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner size="lg" className="text-amber-500" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12">
          <p className="text-red-500 dark:text-red-400 mb-4">{error}</p>
          <Button onClick={fetchPosts} className="bg-amber-500 hover:bg-amber-600 text-black">Try Again</Button>
        </div>
      );
    }

    if (posts.length === 0) {
      return (
        <div className="text-center py-12 bg-gray-900/50 border border-gray-800 rounded-lg">
          <MessageSquareOff className="h-12 w-12 mx-auto text-amber-500/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No posts found</h3>
          <p className="text-muted-foreground mb-6">
            {type === 'bookmarks' 
              ? "You haven't bookmarked any posts yet."
              : searchTerm || selectedCategory || selectedTags.length > 0
                ? "No posts match your current filters."
                : "Be the first to start a discussion!"}
          </p>
          {isAuthenticated && type !== 'bookmarks' && (
            <Button 
              onClick={() => setShowNewPostDialog(true)}
              className="bg-gradient-to-r from-amber-400 to-yellow-600 hover:from-amber-500 hover:to-yellow-700 text-black font-medium"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Post
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {posts.map(post => (
          <Card key={post.id} className="hover:border-amber-500/50 transition-colors bg-gray-900/50 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={getCategoryColor(post.category)}>
                      {getCategoryIcon(post.category)}
                      <span className="ml-1">{getCategoryLabel(post.category)}</span>
                    </Badge>
                    {post.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="border-gray-700 bg-gray-800/50">
                        {tag}
                      </Badge>
                    ))}
                    {post.tags.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{post.tags.length - 3} more
                      </span>
                    )}
                  </div>
                  <CardTitle 
                    className="text-xl hover:text-amber-400 cursor-pointer"
                    onClick={() => setCurrentPostId(post.id)}
                  >
                    {post.title}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {isAuthenticated && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleBookmarkPost(post.id)}
                      className={post.isBookmarked ? 'text-amber-400' : 'text-gray-500 hover:text-amber-400'}
                    >
                      <Bookmark className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <p className="line-clamp-2 text-muted-foreground">
                {post.content}
              </p>
            </CardContent>
            <CardFooter className="flex justify-between pt-2">
              <div className="flex items-center text-sm text-muted-foreground">
                <User className="h-3 w-3 mr-1" />
                <span className="mr-3">{post.authorName}</span>
                <Calendar className="h-3 w-3 mr-1" />
                <span>{formatDate(post.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`flex items-center gap-1 px-2 ${post.isLiked ? 'text-amber-400' : 'hover:text-amber-400'}`}
                  onClick={() => handleLikePost(post.id)}
                >
                  <ThumbsUp className={`h-4 w-4 ${post.isLiked ? 'fill-amber-400' : ''}`} />
                  <span>{post.likes}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 px-2 hover:text-amber-400"
                  onClick={() => setCurrentPostId(post.id)}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>{post.comments}</span>
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  // Helper function to render post details
  function renderPostDetails() {
    const post = posts.find(p => p.id === currentPostId);
    
    if (!post) {
      return (
        <div className="text-center py-4">
          <p>Post not found</p>
        </div>
      );
    }
    
    return (
      <>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={getCategoryColor(post.category)}>
              {getCategoryIcon(post.category)}
              <span className="ml-1">{getCategoryLabel(post.category)}</span>
            </Badge>
            <div className="flex items-center text-sm text-muted-foreground">
              <User className="h-3 w-3 mr-1" />
              <span>{post.authorName}</span>
            </div>
            <div className="flex items-center text-sm text-muted-foreground">
              <Calendar className="h-3 w-3 mr-1" />
              <span>{formatDate(post.createdAt)}</span>
            </div>
          </div>
          <DialogTitle className="text-2xl text-amber-400">{post.title}</DialogTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            {post.tags.map(tag => (
              <Badge key={tag} variant="outline" className="border-gray-700 bg-gray-800/50">
                {tag}
              </Badge>
            ))}
          </div>
        </DialogHeader>
        
        <div className="my-4 whitespace-pre-wrap">
          {post.content}
        </div>
        
        <div className="flex items-center justify-between border-t border-gray-800 pt-4 mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className={`flex items-center gap-1 ${post.isLiked ? 'text-amber-400' : 'hover:text-amber-400'}`}
              onClick={() => handleLikePost(post.id)}
            >
              <ThumbsUp className={`h-4 w-4 ${post.isLiked ? 'fill-amber-400' : ''}`} />
              <span>{post.likes} Likes</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`flex items-center gap-1 ${post.isBookmarked ? 'text-amber-400' : 'hover:text-amber-400'}`}
              onClick={() => handleBookmarkPost(post.id)}
            >
              <Bookmark className={`h-4 w-4 ${post.isBookmarked ? 'fill-amber-400' : ''}`} />
              <span>{post.isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 hover:text-amber-400"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/community/${post.id}`);
                alert('Link copied to clipboard!');
              }}
            >
              <Share className="h-4 w-4" />
              <span>Share</span>
            </Button>
          </div>
          
          {isAuthenticated && post.authorId !== user?.id && (
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 text-red-500"
            >
              <Flag className="h-4 w-4" />
              <span>Report</span>
            </Button>
          )}
        </div>
        
        <div className="border-t border-gray-800 pt-4">
          <h3 className="font-medium text-lg mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-amber-400" />
            Comments ({post.comments})
          </h3>
          
          {isAuthenticated ? (
            <form onSubmit={handleAddComment} className="mb-6">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="mb-2 bg-gray-800 border-gray-700 focus:border-amber-500"
              />
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={!newComment.trim() || submittingComment}
                  className="bg-gradient-to-r from-amber-400 to-yellow-600 hover:from-amber-500 hover:to-yellow-700 text-black font-medium"
                >
                  {submittingComment ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Posting...
                    </>
                  ) : (
                    'Post Comment'
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="bg-gray-800/50 rounded-lg p-4 mb-6 text-center">
              <p className="text-muted-foreground mb-2">
                You need to be signed in to comment
              </p>
              <Link to="/login">
                <Button variant="outline" size="sm" className="border-amber-500 text-amber-500 hover:bg-amber-500/10">
                  Sign In
                </Button>
              </Link>
            </div>
          )}
          
          {loadingComments ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner className="text-amber-500" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <MessageSquareOff className="h-8 w-8 mx-auto mb-2 text-amber-500/50" />
              <p>No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => (
                <div key={comment.id} className="border border-gray-800 rounded-lg p-4 bg-gray-900/30">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-r from-amber-400 to-yellow-600 flex items-center justify-center text-black font-bold">
                        {comment.authorName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-amber-300">{comment.authorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(comment.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-400">
                      <ThumbsUp className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }
};

export default CommunityBoardPage;