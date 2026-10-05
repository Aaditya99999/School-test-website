<?php
/**
 * Radha Krishna Memorial Education Centre — server settings for Hostinger
 * -------------------------------------------------------------------
 * Fill these in ON HOSTINGER: hPanel -> File Manager -> public_html ->
 * right-click config.php -> Edit. Save, and you're done.
 *
 * NEVER put real passwords or keys in the copy of this file on GitHub.
 * Visitors cannot read this file: it prints nothing, and .htaccess
 * blocks it as well.
 */

return [
    // Your domain without https:// or www, e.g. 'rkmec.in'
    'site_domain'   => 'example.com',

    // Google Sheet that stores admission enquiries (see HOSTINGER-SETUP.md).
    // sheet_url:    the Web app URL from Apps Script -> Deploy (ends in /exec)
    // sheet_secret: the same long random password you put in the Apps Script
    'sheet_url'     => '',
    'sheet_secret'  => '',

    // Chatbot (AICredits). Leave the key empty to keep the chatbot off.
    'ai_api_key'    => '',
    'ai_api_base'   => 'https://api.aicredits.in/v1',   // or https://api.aicreditsapi.com/v1
    'ai_model'      => 'gpt-4o-mini',
];
