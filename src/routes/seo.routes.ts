import { Router } from 'express';
import Post from '../models/Post.js';
import Course from '../models/Course.js';

const router = Router();

router.get('/sitemap.xml', async (req, res) => {
  const baseUrl = process.env.API_BASE || 'https://changex.academy';
  const posts = await Post.find({ isPublished: true }).select('slug updatedAt');
  const courses = await Course.find({ isPublished: true, approvalStatus: 'approved' }).select('slug updatedAt');
  
  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Add static pages
  const staticPages = ['', '/courses', '/blog', '/about', '/contact'];
  for (const page of staticPages) {
    sitemap += `<url><loc>${baseUrl}${page}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
  }
  
  // Add posts
  for (const post of posts) {
    sitemap += `<url><loc>${baseUrl}/post/${post.slug}</loc><lastmod>${post.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
  }
  
  // Add courses
  for (const course of courses) {
    sitemap += `<url><loc>${baseUrl}/courses/${course.slug || course._id}</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>\n`;
  }
  
  sitemap += '</urlset>';
  res.header('Content-Type', 'application/xml');
  res.send(sitemap);
});

export default router;
