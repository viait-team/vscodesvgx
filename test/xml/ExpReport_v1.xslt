<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="html" encoding="UTF-8" indent="yes" />

    <xsl:template match="/">
        <html>
            <head>
                <title>Business Expense Report</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { background-color: #D2FFFF; padding: 10px; border-bottom: 3px solid #0588BA; }
                    .title { font-size: 20pt; font-weight: bold; }
                    .employee-info { margin: 20px 0; }
                    .section-title { background-color: #D2FFFF; padding: 5px; font-size: 14pt; font-weight: bold; border-bottom: 1px solid black; }
                    .expense-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                    .expense-table th, .expense-table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                    .expense-table th { background-color: #C0C0C0; font-weight: bold; }
                    .expense-table tr:nth-child(even) { background-color: #E0E0E0; }
                    .summary { margin: 20px 0; }
                    .total { font-size: 16pt; font-weight: bold; }
                    .currency { font-weight: bold; }
                </style>
            </head>
            <body>
                <xsl:for-each select="expense-report">
                    <div class="header">
                        <div class="title">Business Expense Report</div>
                        <div>
                            Currency: <xsl:value-of select="@currency"/>
                            | Total: <span class="currency"><xsl:value-of select="@total-sum"/></span>
                            <xsl:choose>
                                <xsl:when test="@currency = 'USD'">$</xsl:when>
                                <xsl:when test="@currency = 'Euro'">€</xsl:when>
                                <xsl:when test="@currency = 'JPY'">¥</xsl:when>
                                <xsl:otherwise><xsl:value-of select="@currency"/></xsl:otherwise>
                            </xsl:choose>
                        </div>
                    </div>

                    <div class="employee-info">
                        <div class="section-title">Employee Information</div>
                        <xsl:for-each select="Person">
                            <table style="width: 100%; margin: 10px 0;">
                                <tr>
                                    <td><strong>Name:</strong> <xsl:value-of select="First"/> <xsl:value-of select="Last"/></td>
                                    <td><strong>Title:</strong> <xsl:value-of select="Title"/></td>
                                </tr>
                                <tr>
                                    <td><strong>Email:</strong> <xsl:value-of select="Email"/></td>
                                    <td><strong>Phone:</strong> <xsl:value-of select="Phone"/></td>
                                </tr>
                            </table>
                        </xsl:for-each>
                    </div>

                    <div class="section-title">Expense List</div>
                    <table class="expense-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Expense To</th>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <xsl:for-each select="expense-item">
                                <tr>
                                    <td><xsl:value-of select="@type"/></td>
                                    <td><xsl:value-of select="@expto"/></td>
                                    <td><xsl:value-of select="Date"/></td>
                                    <td style="text-align: right;">
                                        <xsl:value-of select="expense"/>
                                        <xsl:choose>
                                            <xsl:when test="/expense-report/@currency = 'USD'">$</xsl:when>
                                            <xsl:when test="/expense-report/@currency = 'Euro'">€</xsl:when>
                                            <xsl:when test="/expense-report/@currency = 'JPY'">¥</xsl:when>
                                            <xsl:otherwise><xsl:value-of select="/expense-report/@currency"/></xsl:otherwise>
                                        </xsl:choose>
                                    </td>
                                    <td><xsl:value-of select="description"/></td>
                                </tr>
                            </xsl:for-each>
                        </tbody>
                    </table>

                    <div class="summary">
                        <div class="section-title">Expense Summary</div>
                        <table style="width: 50%; margin: 10px 0;">
                            <tr>
                                <td><strong>Total Lodging:</strong></td>
                                <td style="text-align: right;">
                                    <xsl:value-of select="sum(expense-item[@type='Lodging']/expense)"/>
                                    <xsl:choose>
                                        <xsl:when test="@currency = 'USD'">$</xsl:when>
                                        <xsl:when test="@currency = 'Euro'">€</xsl:when>
                                        <xsl:when test="@currency = 'JPY'">¥</xsl:when>
                                        <xsl:otherwise><xsl:value-of select="@currency"/></xsl:otherwise>
                                    </xsl:choose>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>Total Entertainment:</strong></td>
                                <td style="text-align: right;">
                                    <xsl:value-of select="sum(expense-item[@type='Entertainment']/expense)"/>
                                    <xsl:choose>
                                        <xsl:when test="@currency = 'USD'">$</xsl:when>
                                        <xsl:when test="@currency = 'Euro'">€</xsl:when>
                                        <xsl:when test="@currency = 'JPY'">¥</xsl:when>
                                        <xsl:otherwise><xsl:value-of select="@currency"/></xsl:otherwise>
                                    </xsl:choose>
                                </td>
                            </tr>
                            <tr style="border-top: 2px solid black;">
                                <td class="total">TOTAL EXPENSES:</td>
                                <td class="total" style="text-align: right;">
                                    <xsl:value-of select="sum(expense-item/expense)"/>
                                    <xsl:choose>
                                        <xsl:when test="@currency = 'USD'">$</xsl:when>
                                        <xsl:when test="@currency = 'Euro'">€</xsl:when>
                                        <xsl:when test="@currency = 'JPY'">¥</xsl:when>
                                        <xsl:otherwise><xsl:value-of select="@currency"/></xsl:otherwise>
                                    </xsl:choose>
                                </td>
                            </tr>
                        </table>
                    </div>
                </xsl:for-each>
            </body>
        </html>
    </xsl:template>
</xsl:stylesheet>
