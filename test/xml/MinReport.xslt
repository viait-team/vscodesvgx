<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" encoding="UTF-8" indent="no"/>
  <xsl:template match="/">
    <html><head><title>Expenses</title></head><body>
      <xsl:for-each select="expense-report">
        <h1><xsl:value-of select="Person/First"/> <xsl:value-of select="Person/Last"/></h1>
        <table border="1">
          <xsl:for-each select="expense-item">
            <tr>
              <td><xsl:value-of select="@type"/></td>
              <td><xsl:value-of select="Date"/></td>
              <td><xsl:value-of select="expense"/></td>
            </tr>
          </xsl:for-each>
        </table>
      </xsl:for-each>
    </body></html>
  </xsl:template>
</xsl:stylesheet>