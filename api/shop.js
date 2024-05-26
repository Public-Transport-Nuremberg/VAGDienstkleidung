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

router.get('/items', verifyRequest('web.admin.inventory.read'), limiter(1), async (req, res) => {
    const { minPrice, maxPrice, ArticleType, search } = await queryItemsSchema.validateAsync(req.query);

    const sql_response = await shop.search(minPrice, maxPrice, ArticleType, search);

    res.status(200);
    res.json(sql_response);
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};