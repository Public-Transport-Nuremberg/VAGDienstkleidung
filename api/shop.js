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
const PluginName = 'Shop'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const queryItemsSchema = Joi.object({
    minPrice: Joi.number().min(0).max(100_000).required(),
    maxPrice: Joi.number().min(Joi.ref('minPrice')).max(100_000).required(),
    ArticleType: Joi.string().required(),
    search: Joi.string().allow('').optional(),
});

const validateJsonSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            id: Joi.number().integer().required(),
            size: Joi.string().required(),
            amount: Joi.number().integer().required(),
            totalPrice: Joi.allow(null).optional()
        })
    ).required()
});

const ordersListQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
    sort: Joi.string().valid(
        'uuid', 'user_id', 'pickup_time', 'status', 'price'
    ).default('article'),
    order: Joi.string().valid('asc', 'desc').default('asc'),
    search: Joi.string().allow('').default('')
});

router.get('/items', verifyRequest('web.admin.inventory.read'), limiter(1), async (req, res) => {
    const { minPrice, maxPrice, ArticleType, search } = await queryItemsSchema.validateAsync(req.query);

    const sql_response = await shop.search(minPrice, maxPrice, ArticleType, search);

    res.status(200);
    res.json(sql_response);
});

router.post('/createOrder', verifyRequest('web.user.order.write'), limiter(1), async (req, res) => {
    const { items } = await validateJsonSchema.validateAsync(await req.json());

    const sql_response = await shop.createOrder(items, req.user.user_id);

    res.status(200);
    res.json(sql_response);
});

router.get('/orders', verifyRequest('web.admin.order.read'), limiter(1), async (req, res) => {
    const { page, limit, sort, order, search } = await ordersListQuerySchema.validateAsync(req.query);
    const offset = (page - 1) * limit;

    const sql_response = await shop.orders.list(offset, limit, sort, order, search);

    res.status(200);
    res.json(sql_response);
});

router.get('/myorders', verifyRequest('web.user.order.read'), limiter(1), async (req, res) => {
    const { page, limit, sort, order, search } = await ordersListQuerySchema.validateAsync(req.query);
    const offset = (page - 1) * limit;

    const sql_response = await shop.orders.mylist(offset, limit, sort, order, search, req.user.user_id);

    res.status(200);
    res.json(sql_response);
});

router.get('/order/:id', verifyRequest('web.admin.order.read'), limiter(1), async (req, res) => {
    const { id } = await Joi.object({ id: Joi.string().required() }).validateAsync(req.params);

    const sql_response = await shop.orders.get(id);

    res.status(200);
    res.json(sql_response);
});

router.get('/myorder/:id', verifyRequest('web.user.order.read'), limiter(1), async (req, res) => {
    const { id } = await Joi.object({ id: Joi.string().required() }).validateAsync(req.params);

    const sql_response = await shop.orders.myget(id, req.user.user_id);

    res.status(200);
    res.json(sql_response);
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};