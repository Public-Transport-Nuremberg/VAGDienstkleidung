const Joi = require('@lib/sanitizer');
const { user, shop } = require('@lib/postgres');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { delWebtoken } = require('@lib/cache');
const { sendMail } = require('@lib/queues');
const { generateUrlPath } = require('@lib/utils');
const HyperExpress = require('hyper-express');
const bcrypt = require('bcrypt');
const { InvalidRouteInput, DBError, InvalidLogin } = require('@lib/errors');
const router = new HyperExpress.Router();

/* Plugin info*/
const PluginName = 'Inventory Managment'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const inventoryListQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
    sort: Joi.string().valid(
        'article', 'article_type', 'article_number', 'price',
        'stock_xs', 'stock_s', 'stock_m', 'stock_l', 'stock_xl', 'stock_xxl'
    ).default('article'),
    order: Joi.string().valid('asc', 'desc').default('asc'),
    search: Joi.string().allow('').default('')
});

const inventorySchema = Joi.object({
    article: Joi.fullysanitizedString().required(),
    article_type: Joi.string().valid('TShirt', 'Hoodie', 'Sweatshirt', 'Pants', 'Shorts', 'Cap', 'Beanie', 'Bag', 'Shoes', 'Socks', 'Underwear', 'Jacket', 'Coat', 'Dress', 'Skirt', 'Top', 'Bottom', 'Suit', 'Accessories').required(),
    article_number: Joi.string().required(),
    price: Joi.number().integer().min(0).max(100_000).required(),
    description: Joi.sanitizedString().allow(''),
    gender: Joi.string().valid('B', 'F', 'M').required(),
    stock_xs: Joi.number().integer().min(0).max(100_000).required(),
    stock_s: Joi.number().integer().min(0).max(100_000).required(),
    stock_m: Joi.number().integer().min(0).max(100_000).required(),
    stock_l: Joi.number().integer().min(0).max(100_000).required(),
    stock_xl: Joi.number().integer().min(0).max(100_000).required(),
    stock_xxl: Joi.number().integer().min(0).max(100_000).required()
});

const inventoryIdSchema = Joi.object({
    id: Joi.number().integer().min(1).required()
});

const inventoryStockSchema = Joi.object({
    id: Joi.number().integer().min(1).required(),
    stock: Joi.string().valid('price', 'stock_xs', 'stock_s', 'stock_m', 'stock_l', 'stock_xl', 'stock_xxl').required()
});

const inventoryStockSetSchema = Joi.object({
    new_val: Joi.number().integer().min(0).max(100_000).required()
});

router.get('/', verifyRequest('web.admin.inventory.read'), limiter(1), async (req, res) => {
    try {
        const { page, limit, sort, order, search } = await inventoryListQuerySchema.validateAsync(req.query);
        const offset = (page - 1) * limit;

        const sql_response = await shop.inventory.list(offset, limit, sort, order, search);
        if (!sql_response) throw new Error('Failed to retrieve inventory data');

        res.status(200).json(sql_response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/', verifyRequest('web.admin.inventory.create'), limiter(1), async (req, res) => {
    const { article, article_type, article_number, price, description, gender, stock_xs, stock_s, stock_m, stock_l, stock_xl, stock_xxl } = await inventorySchema.validateAsync(await req.json());

    const sql_response = await shop.inventory.create(article, article_type, article_number, price, description, gender, stock_xs, stock_s, stock_m, stock_l, stock_xl, stock_xxl);

    if (!sql_response) throw new Error('Failed to create inventory item');

    res.status(200).json({ message: 'Inventory item created' });
});

router.delete('/:id', verifyRequest('web.admin.inventory.write'), limiter(1), async (req, res) => {
    const { id } = await inventoryIdSchema.validateAsync(req.params);

    const sql_response = await shop.inventory.delete(id);
    if (!sql_response) throw new Error('Failed to delete inventory item');

    res.status(200).json({ message: 'Inventory item deleted' });
});

router.post('/:id/:stock/set', verifyRequest('web.admin.inventory.write'), limiter(1), async (req, res) => {
    const { id, stock } = await inventoryStockSchema.validateAsync(req.params);
    const { new_val } = await inventoryStockSetSchema.validateAsync(await req.json());

    const sql_response = await shop.inventory.setCollumValue(id, stock, new_val);

    res.status(200).json({ [stock]: sql_response[stock] });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};