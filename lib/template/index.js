const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const { RenderError } = require('@lib/errors');

const auth = require('@config/auth.js');
const { default_group, default_member_group } = require('@config/permissions.js');

class ViewRenderer {
    constructor(app, viewsDir, ttl = Number(process.env.DYNAMICVIEWCACHE_TTL) || 60) {
        if (ViewRenderer.instance) {
            return ViewRenderer.instance;
        }

        ViewRenderer.instance = this;

        this.app = app;
        this.viewsDir = viewsDir;
        this.ttl = ttl;
        this.dynamicCache = {}; // Cache for dynamic pages
        this.static_pages = {}; // Cache for static pages, no TTL

        this.registeredRoutes = new Set();

        this.initiateCacheCleaning();
    }

    /**
     * Render and register all static EJS files in the views directory
     * @param {String} sourceDir 
     * @param {Array} exclude 
     * @param {Object} customRoutes A map of overrides for specific paths. Keys are original paths, values are new paths.
     * @param {String} baseDir 
     */
    registerStaticRoutes(sourceDir, exclude = [], customRoutes = {}, baseDir = sourceDir) {
        const context = getContextObject();

        fs.readdirSync(sourceDir, { withFileTypes: true }).forEach(dirent => {
            if (dirent.name.startsWith('_') || exclude.includes(dirent.name.split(path.sep).join('/'))) {
                return;
            }

            const sourcePath = path.join(sourceDir, dirent.name);
            const relativeSourcePath = path.relative(baseDir, sourcePath).split(path.sep).join('/');
            const extension = path.extname(sourcePath);
            let cacheKey = '/' + relativeSourcePath.replace(extension, '');

            // Check if there is a custom route for this path and adjust the cacheKey accordingly
            if (customRoutes.hasOwnProperty(relativeSourcePath)) {
                cacheKey = customRoutes[relativeSourcePath];
            }

            if (dirent.isDirectory()) {
                // Pass the customRoutes down recursively
                this.registerStaticRoutes(sourcePath, exclude, customRoutes, baseDir);
            } else if (extension === '.ejs') {
                if (this.static_pages[cacheKey]) return;
                ejs.renderFile(sourcePath, context, (err, str) => {
                    if (err) throw new RenderError("Static Rendering Error").setError(err);
                    this.static_pages[cacheKey] = str;

                    if (!this.registeredRoutes.has(cacheKey)) {
                        this.app.get(cacheKey, (req, res) => {
                            process.log.debug(`Loaded static page: ${cacheKey}`);
                            res.send(str)
                        });
                        process.log.debug(`Registered static page: ${cacheKey}`);
                        this.registeredRoutes.add(cacheKey);
                    }
                });
            }
        });
    }

    /**
     * Register all dynamic EJS files in the views directory
     */
    registerDynamicRoutes() {
        /**
         * Scan a directory for dynamic routes
         * @param {String} dir 
         * @param {String} baseRoute 
         */
        const scanDirectory = (dir, baseRoute = '') => {
            fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
                const relativePath = path.relative(this.viewsDir, path.join(dir, dirent.name));
                const routePath = this.convertFilenameToRoute(relativePath);
                if (dirent.isDirectory()) {
                    scanDirectory(path.join(dir, dirent.name), baseRoute + dirent.name + '/');
                } else if (dirent.name.startsWith('_')) {
                    if (!this.registeredRoutes.has(routePath)) {
                        this.registerRoute(path.join(dir, dirent.name), routePath);
                        this.registeredRoutes.add(routePath);
                    }
                }
            });
        };

        scanDirectory(this.viewsDir);
    }

    /**
     * Register a dynamic route
     * @param {String} filePath 
     * @param {String} routePath 
     */
    registerRoute(filePath, routePath) {
        this.app.get(routePath, (req, res) => {
            for (const [key, value] of Object.entries(req.params)) {
                if (value.length > 64) {
                    throw new RenderError(`Parameter '${key}' exceeds the maximum length of 64 characters.`).withStatus(400).withInfo("InvalidRouteInput");
                }
            }

            const cacheKey = routePath + JSON.stringify(req.params);

            const cachedContent = this.dynamicCache[cacheKey];
            // Cache is automaticly cleaned in intervals, so no time check needed here
            if (cachedContent) {
                process.log.debug(`Loaded dynamic page template: ${this.#replaceInString(routePath, req.params)}`);
                return res.send(cachedContent.html);
            }

            ejs.renderFile(filePath, { params: req.params, ...getContextObject() }, (err, str) => {
                if (err) throw new RenderError("Rendering Error").setError(err);

                this.dynamicCache[cacheKey] = { html: str, timestamp: Date.now() };
                process.log.debug(`Cached dynamic page template: ${this.#replaceInString(routePath, req.params)}`);
                res.send(str);
            });
        });
    }

    /**
     * Convert a file path to a route path, remove index from names and parse parameters
     * @param {String} filePath 
     * @returns 
     */
    convertFilenameToRoute(filePath) {
        let normalizedPath = filePath.replace(/\\/g, '/').replace('.ejs', '');

        let segments = normalizedPath.split('/').map(segment => {
            if (segment.startsWith('_')) {
                let [dynamicPart, suffix] = segment.substring(1).split('_', 2);
                if (suffix && suffix !== 'index') {
                    return ':' + dynamicPart + '/' + suffix;
                } else {
                    return ':' + dynamicPart;
                }
            }
            return segment;
        });

        let route = segments.join('/');
        if (!route.startsWith('/')) {
            route = '/' + route;
        }

        if (route.endsWith('/index')) {
            route = route.substring(0, route.length - '/index'.length);
        }

        return route;
    }

    /**
     * Replace placeholders in a string with data
     * @param {String} template 
     * @param {Object} data 
     * @returns 
     */
    #replaceInString(template, data) {
        return template.replace(/:([a-zA-Z]+)/g, (match, key) => {
            if (data.hasOwnProperty(key)) {
                return data[key];
            }
            return match;
        });
    }

    /**
     * Initiate the cache cleaning interval
     */
    initiateCacheCleaning() {
        const cleaningInterval = 1000; // In milliseconds

        setInterval(() => {
            const now = Date.now();
            Object.keys(this.dynamicCache).forEach((key) => {
                const cachedItem = this.dynamicCache[key];
                if (now - cachedItem.timestamp > this.ttl * 1000) {
                    delete this.dynamicCache[key];
                }
            });
        }, cleaningInterval);
    }
}

/**
 * Generate the context object to pass to EJS templates
 * @returns {Object} - The context object to pass to EJS templates
 */
const getContextObject = () => {
    const context = {
        Github: {
            OAuthUrl: `${auth.Github.url}?client_id=${auth.Github.clientID}&scope=${auth.Github.url_scope.join(',')}`,
        },
        Google: {
            OAuthUrl: `${auth.Google.url}?client_id=${auth.Google.clientID}&redirect_uri=${auth.Google.url_redirect}&response_type=code&scope=${auth.Google.url_scope.join(' ')}`,
        },
        default_group: default_group,
        default_member_group: default_member_group,
        countryConfig: process.countryConfig,
        linkableapps: process.linkableapps,
        domain: process.env.DOMAIN,
    };

    return context;
};

module.exports = {
    ViewRenderer,
    getContextObject,
};