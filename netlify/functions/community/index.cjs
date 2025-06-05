// netlify/functions/community/index.cjs
const { Redis } = require('@upstash/redis');
const jwt = require('jsonwebtoken');
const { parse } = require('cookie');
const { nanoid } = require('nanoid');

// Initialize Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const AUTH_MODE = process.env.AUTH_MODE || 'cookie'; // 'cookie' or 'bearer'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Helper to verify authentication
async function authenticateUser(event) {
  // Extract token based on auth mode
  let token;
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (AUTH_MODE === 'bearer') {
    // Bearer token mode - only check Authorization header
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  } else {
    // Cookie mode - check both header and cookies for backward compatibility
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Check for token in cookies
      const cookies = event.headers.cookie;
      if (cookies) {
        const parsedCookies = parse(cookies);
        token = parsedCookies.auth_token;
      }
    }
  }

  if (!token) {
    throw new Error('No token provided');
  }

  if (token.trim() === '' || token === 'null' || token === 'undefined') {
    throw new Error('Invalid token format');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.sub || decoded.userId; // Use 'sub' field which contains the user ID
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    throw new Error('Invalid token');
  }
}

// Helper to get user data
async function getUserData(userId) {
  try {
    const userData = await redis.get(`user:${userId}`);
    if (!userData) {
      throw new Error('User not found');
    }
    return typeof userData === 'string' ? JSON.parse(userData) : userData;
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const { httpMethod, path, queryStringParameters } = event;
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1];
    const postId = resource !== 'community' ? resource : null;
    const isCommentsEndpoint = pathParts.includes('comments');

    // Public endpoints (no auth required)
    if (httpMethod === 'GET') {
      if (!postId || postId === 'community') {
        return await handleGetPosts(queryStringParameters);
      } else if (isCommentsEndpoint) {
        return await handleGetComments(postId);
      } else {
        return await handleGetPost(postId);
      }
    }

    // Protected endpoints (auth required)
    let userId;
    try {
      userId = await authenticateUser(event);
    } catch (error) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Authentication required' }),
      };
    }

    // Get user data for role check
    const user = await getUserData(userId);

    switch (httpMethod) {
      case 'POST':
        if (!postId || postId === 'community') {
          return await handleCreatePost(event, userId, user);
        } else if (isCommentsEndpoint) {
          return await handleCreateComment(event, postId, userId, user);
        } else if (path.includes('/like')) {
          return await handleLikePost(event, postId, userId);
        } else if (path.includes('/bookmark')) {
          return await handleBookmarkPost(event, postId, userId);
        }
        break;
      case 'PUT':
        if (postId && postId !== 'community') {
          return await handleUpdatePost(event, postId, userId, user);
        }
        break;
      case 'DELETE':
        if (postId && postId !== 'community') {
          return await handleDeletePost(postId, userId, user);
        }
        break;
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Endpoint not found' }),
    };
  } catch (error) {
    console.error('Community function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
};

// Handler functions

async function handleGetPosts(queryParams) {
  try {
    const { search, category, tags, bookmarked, userId, sortBy = 'createdAt', sortOrder = 'desc' } = queryParams || {};

    // Get all post IDs
    let postIds = await redis.lrange('community:posts', 0, -1);

    if (!postIds || postIds.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, data: [] }),
      };
    }

    // Get post data
    const postsData = await Promise.all(
      postIds.map(async (id) => {
        const data = await redis.hgetall(`community:post:${id}`);
        if (!data || !data.id) return null;

        // Parse tags
        let parsedTags = [];
        try {
          parsedTags = JSON.parse(data.tags || '[]');
        } catch (e) {
          console.error('Error parsing tags:', e);
        }

        // Get like count
        const likeCount = await redis.scard(`community:post:${id}:likes`) || 0;
        
        // Get comment count
        const commentCount = await redis.llen(`community:post:${id}:comments`) || 0;

        // Check if user has liked the post (if userId provided)
        let isLiked = false;
        if (userId) {
          isLiked = await redis.sismember(`community:post:${id}:likes`, userId);
        }

        // Check if user has bookmarked the post (if userId provided)
        let isBookmarked = false;
        if (userId) {
          isBookmarked = await redis.sismember(`user:${userId}:bookmarks`, id);
        }

        return {
          ...data,
          tags: parsedTags,
          likes: likeCount,
          comments: commentCount,
          isLiked,
          isBookmarked,
        };
      })
    );

    // Filter out null values and apply filters
    let filteredPosts = postsData.filter((post) => post !== null);

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPosts = filteredPosts.filter(
        (post) =>
          post.title.toLowerCase().includes(searchLower) ||
          post.content.toLowerCase().includes(searchLower)
      );
    }

    // Apply category filter
    if (category) {
      filteredPosts = filteredPosts.filter((post) => post.category === category);
    }

    // Apply tags filter
    if (tags) {
      const tagArray = tags.split(',').map((tag) => tag.trim());
      filteredPosts = filteredPosts.filter((post) =>
        post.tags.some((tag) => tagArray.includes(tag))
      );
    }

    // Apply bookmarked filter
    if (bookmarked === 'true' && userId) {
      const userBookmarks = await redis.smembers(`user:${userId}:bookmarks`);
      filteredPosts = filteredPosts.filter((post) => userBookmarks.includes(post.id));
    }

    // Sort posts
    filteredPosts.sort((a, b) => {
      if (sortBy === 'likes') {
        return sortOrder === 'desc' ? b.likes - a.likes : a.likes - b.likes;
      } else if (sortBy === 'comments') {
        return sortOrder === 'desc' ? b.comments - a.comments : a.comments - b.comments;
      } else {
        // Default sort by date
        return sortOrder === 'desc'
          ? new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime()
          : new Date(a[sortBy]).getTime() - new Date(b[sortBy]).getTime();
      }
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: filteredPosts }),
    };
  } catch (error) {
    console.error('Error getting posts:', error);
    throw error;
  }
}

async function handleGetPost(postId) {
  try {
    const postData = await redis.hgetall(`community:post:${postId}`);

    if (!postData || !postData.id) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Post not found' }),
      };
    }

    // Parse tags
    let parsedTags = [];
    try {
      parsedTags = JSON.parse(postData.tags || '[]');
    } catch (e) {
      console.error('Error parsing tags:', e);
    }

    // Get like count
    const likeCount = await redis.scard(`community:post:${postId}:likes`) || 0;
    
    // Get comment count
    const commentCount = await redis.llen(`community:post:${postId}:comments`) || 0;

    const post = {
      ...postData,
      tags: parsedTags,
      likes: likeCount,
      comments: commentCount,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: post }),
    };
  } catch (error) {
    console.error('Error getting post:', error);
    throw error;
  }
}

async function handleCreatePost(event, userId, user) {
  try {
    const requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { title, content, category = 'discussion', tags = [] } = requestBody;

    if (!title || !content) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Title and content are required' }),
      };
    }

    const postId = nanoid();
    const now = new Date().toISOString();

    const post = {
      id: postId,
      title,
      content,
      category,
      tags: JSON.stringify(Array.isArray(tags) ? tags : []),
      authorId: userId,
      authorName: user.name || user.username || 'Anonymous',
      createdAt: now,
      updatedAt: now,
    };

    // Store post
    await redis.hset(`community:post:${postId}`, post);

    // Add to posts list
    await redis.lpush('community:posts', postId);

    // Add to user's posts list
    await redis.lpush(`user:${userId}:posts`, postId);

    // Add to category index
    await redis.sadd(`community:category:${category}`, postId);

    // Add to tag indices
    for (const tag of tags) {
      await redis.sadd(`community:tag:${tag}`, postId);
    }

    // Parse tags for response
    const parsedPost = {
      ...post,
      tags: Array.isArray(tags) ? tags : [],
      likes: 0,
      comments: 0,
    };

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: parsedPost }),
    };
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
}

async function handleUpdatePost(event, postId, userId, user) {
  try {
    const postData = await redis.hgetall(`community:post:${postId}`);

    if (!postData || !postData.id) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Post not found' }),
      };
    }

    // Check ownership or admin status
    if (postData.authorId !== userId && user.role !== 'admin') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'You do not have permission to update this post' }),
      };
    }

    const requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { title, content, category, tags } = requestBody;

    const updates = {
      ...postData,
      updatedAt: new Date().toISOString(),
    };

    if (title) updates.title = title;
    if (content) updates.content = content;
    
    // Handle category change
    if (category && category !== postData.category) {
      // Remove from old category
      await redis.srem(`community:category:${postData.category}`, postId);
      // Add to new category
      await redis.sadd(`community:category:${category}`, postId);
      updates.category = category;
    }

    // Handle tags change
    if (tags) {
      const oldTags = JSON.parse(postData.tags || '[]');
      
      // Remove from old tag indices
      for (const tag of oldTags) {
        await redis.srem(`community:tag:${tag}`, postId);
      }
      
      // Add to new tag indices
      for (const tag of tags) {
        await redis.sadd(`community:tag:${tag}`, postId);
      }
      
      updates.tags = JSON.stringify(tags);
    }

    // Store updated post
    await redis.hset(`community:post:${postId}`, updates);

    // Parse tags for response
    const parsedTags = tags ? tags : JSON.parse(updates.tags || '[]');
    
    // Get like count
    const likeCount = await redis.scard(`community:post:${postId}:likes`) || 0;
    
    // Get comment count
    const commentCount = await redis.llen(`community:post:${postId}:comments`) || 0;

    const updatedPost = {
      ...updates,
      tags: parsedTags,
      likes: likeCount,
      comments: commentCount,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: updatedPost }),
    };
  } catch (error) {
    console.error('Error updating post:', error);
    throw error;
  }
}

async function handleDeletePost(postId, userId, user) {
  try {
    const postData = await redis.hgetall(`community:post:${postId}`);

    if (!postData || !postData.id) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Post not found' }),
      };
    }

    // Check ownership or admin status
    if (postData.authorId !== userId && user.role !== 'admin') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'You do not have permission to delete this post' }),
      };
    }

    // Remove post from all indices
    await redis.del(`community:post:${postId}`);
    await redis.lrem('community:posts', 0, postId);
    await redis.lrem(`user:${postData.authorId}:posts`, 0, postId);
    await redis.srem(`community:category:${postData.category}`, postId);

    // Remove from tag indices
    const tags = JSON.parse(postData.tags || '[]');
    for (const tag of tags) {
      await redis.srem(`community:tag:${tag}`, postId);
    }

    // Remove likes
    await redis.del(`community:post:${postId}:likes`);

    // Remove comments
    await redis.del(`community:post:${postId}:comments`);

    // Remove from all user bookmarks
    const bookmarkKeys = await redis.keys('user:*:bookmarks');
    for (const key of bookmarkKeys) {
      await redis.srem(key, postId);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, message: 'Post deleted successfully' }),
    };
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
}

async function handleGetComments(postId) {
  try {
    const postData = await redis.hgetall(`community:post:${postId}`);

    if (!postData || !postData.id) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Post not found' }),
      };
    }

    // Get comment IDs
    const commentIds = await redis.lrange(`community:post:${postId}:comments`, 0, -1);

    if (!commentIds || commentIds.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, data: [] }),
      };
    }

    // Get comment data
    const commentsData = await Promise.all(
      commentIds.map(async (id) => {
        const data = await redis.hgetall(`community:comment:${id}`);
        if (!data || !data.id) return null;

        // Get like count
        const likeCount = await redis.scard(`community:comment:${id}:likes`) || 0;

        return {
          ...data,
          likes: likeCount,
        };
      })
    );

    // Filter out null values
    const comments = commentsData.filter((comment) => comment !== null);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: comments }),
    };
  } catch (error) {
    console.error('Error getting comments:', error);
    throw error;
  }
}

async function handleCreateComment(event, postId, userId, user) {
  try {
    const postData = await redis.hgetall(`community:post:${postId}`);

    if (!postData || !postData.id) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Post not found' }),
      };
    }

    const requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { content } = requestBody;

    if (!content) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Comment content is required' }),
      };
    }

    const commentId = nanoid();
    const now = new Date().toISOString();

    const comment = {
      id: commentId,
      postId,
      content,
      authorId: userId,
      authorName: user.name || user.username || 'Anonymous',
      createdAt: now,
    };

    // Store comment
    await redis.hset(`community:comment:${commentId}`, comment);

    // Add to post's comments list
    await redis.lpush(`community:post:${postId}:comments`, commentId);

    // Add to user's comments list
    await redis.lpush(`user:${userId}:comments`, commentId);

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: { ...comment, likes: 0 } }),
    };
  } catch (error) {
    console.error('Error creating comment:', error);
    throw error;
  }
}

async function handleLikePost(event, postId, userId) {
  try {
    const postData = await redis.hgetall(`community:post:${postId}`);

    if (!postData || !postData.id) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Post not found' }),
      };
    }

    const requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { action = 'like' } = requestBody;

    const likeKey = `community:post:${postId}:likes`;

    if (action === 'like') {
      // Add user to post's likes set
      await redis.sadd(likeKey, userId);
    } else if (action === 'unlike') {
      // Remove user from post's likes set
      await redis.srem(likeKey, userId);
    }

    // Get updated like count
    const likeCount = await redis.scard(likeKey) || 0;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        data: { 
          likes: likeCount,
          isLiked: action === 'like'
        } 
      }),
    };
  } catch (error) {
    console.error('Error handling post like:', error);
    throw error;
  }
}

async function handleBookmarkPost(event, postId, userId) {
  try {
    const postData = await redis.hgetall(`community:post:${postId}`);

    if (!postData || !postData.id) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Post not found' }),
      };
    }

    const requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { action = 'bookmark' } = requestBody;

    const bookmarkKey = `user:${userId}:bookmarks`;

    if (action === 'bookmark') {
      // Add post to user's bookmarks set
      await redis.sadd(bookmarkKey, postId);
    } else if (action === 'unbookmark') {
      // Remove post from user's bookmarks set
      await redis.srem(bookmarkKey, postId);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        data: { 
          isBookmarked: action === 'bookmark'
        } 
      }),
    };
  } catch (error) {
    console.error('Error handling post bookmark:', error);
    throw error;
  }
}