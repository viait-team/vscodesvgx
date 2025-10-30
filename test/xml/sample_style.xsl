<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <html>
      <head>
        <title>Book Catalog</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          .book {
            border: 1px solid #ccc;
            margin: 10px 0;
            padding: 15px;
            border-radius: 5px;
            background-color: #f9f9f9;
          }
          .title { font-size: 18px; font-weight: bold; color: #0066cc; }
          .author { font-style: italic; color: #666; }
          .price { font-weight: bold; color: #009900; }
          .genre { background-color: #e6e6e6; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
          .description { margin-top: 10px; line-height: 1.4; }
        </style>
      </head>
      <body>
        <h1>Book Catalog</h1>
        <xsl:for-each select="catalog/book">
          <div class="book">
            <div class="title"><xsl:value-of select="title"/></div>
            <div class="author">by <xsl:value-of select="author"/></div>
            <div style="margin: 5px 0;">
              <span class="genre"><xsl:value-of select="genre"/></span>
              <span class="price" style="margin-left: 10px;">$<xsl:value-of select="price"/></span>
            </div>
            <div style="font-size: 12px; color: #888;">Published: <xsl:value-of select="publish_date"/></div>
            <div class="description"><xsl:value-of select="description"/></div>
          </div>
        </xsl:for-each>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
