// ============================================================
// FILE: src/routes/seo.routes.ts (NEW – sitemap generator)
// ============================================================

import { Router } from 'express';
import Course from '../models/Course.js';
import Book from '../models/Book.js';
import Post from '../models/Post.js';

const router = Router();

router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://changex.academy';
    const courses = await Course.find({ isPublished: true, approvalStatus: 'approved' });
    const books = await Book.find({ isPublished: true });
    const posts = await Post.find({ isPublished: true });

    let urls = `
    <url>
      <loc>${baseUrl}</loc>
      <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
      <changefreq>daily</changefreq>
      <priority>1.0</priority>
    </url>
    <url>
      <loc>${baseUrl}/feed</loc>
      <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.9</priority>
    </url>
    <url>
      <loc>${baseUrl}/explore</loc>
      <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.8</priority>
    </url>
    <url>
      <loc>${baseUrl}/books</loc>
      <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.8</priority>
    </url>
    `;

    // Add courses
    courses.forEach(course => {
      const slug = course.slug || course._id;
      urls += `
      <url>
        <loc>${baseUrl}/courses/${slug}</loc>
        <lastmod>${new Date(course.updatedAt).toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
      </url>
      `;
    });

    // Add books
    books.forEach(book => {
      urls += `
      <url>
        <loc>${baseUrl}/books/${book._id}</loc>
        <lastmod>${new Date(book.updatedAt).toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
      </url>
      `;
    });

    // Add posts
    posts.forEach(post => {
      const slug = post.slug || post._id;
      urls += `
      <url>
        <loc>${baseUrl}/post/${slug}</loc>
        <lastmod>${new Date(post.updatedAt).toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
      </url>
      `;
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
    </urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Robots.txt
router.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://changex.academy';
  const content = `User-agent: *
Allow: /
Sitemap: ${baseUrl}/seo/sitemap.xml`;
  res.header('Content-Type', 'text/plain');
  res.send(content);
});

export default router;
