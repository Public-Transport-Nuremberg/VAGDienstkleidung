const db = require('pg');
const { SQLError, CustomError } = require('@lib/errors');
const { default_group } = require('@config/permissions');
const { getNextLowerDefaultGroup } = require('@lib/permission');

const pool = new db.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

const createTables = async () => {
  await createTable(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`, "uuid-ossp extension");
  // Setup all Users Tables
  await createTable(`CREATE TABLE IF NOT EXISTS users (
      id bigserial PRIMARY KEY,
      puuid UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
      username text UNIQUE,
      email text UNIQUE,
      email_verified TIMESTAMP WITH TIME ZONE,
      password text,
      user_group text,
      first_name text,
      last_name text,
      avatar_url text,
      work_group text,
      credit integer DEFAULT 0,
      credit_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      legal TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      twofa_secret text,
      twofa_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      twofa_token text,
      time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`, "users")

  // Inventory of avaible items in the cloth shop
  await createTable(`CREATE TABLE IF NOT EXISTS inventory (
      id serial PRIMARY KEY,
      uuid UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
      article text,
      article_type text,
      article_number text UNIQUE,
      price integer NOT NULL,
      description text,
      image text,
      gender text,
      stock_xs integer NOT NULL DEFAULT 0,
      stock_s integer NOT NULL DEFAULT 0,
      stock_m integer NOT NULL DEFAULT 0,
      stock_l integer NOT NULL DEFAULT 0,
      stock_xl integer NOT NULL DEFAULT 0,
      stock_xxl integer NOT NULL DEFAULT 0,
      time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`, "inventory")

  await createTable(`CREATE TABLE IF NOT EXISTS orders (
      id serial PRIMARY KEY,
      uuid UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
      user_id integer,
      order_data text,
      price integer,
      pickup_time TIMESTAMP WITH TIME ZONE,
      status integer DEFAULT 0,
      time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`, "orders")

  await createTable(`CREATE TABLE IF NOT EXISTS users_settings (
      user_id integer,
      design text,
      language text,
      PRIMARY KEY (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`, "users_settings")

  await createTable(`CREATE TABLE IF NOT EXISTS users_addresses (
      user_id integer,
      address text,
      city text,
      state text,
      zip text,
      country text,
      PRIMARY KEY (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`, "users_addresses")

  await createTable(`CREATE TABLE IF NOT EXISTS users_permissions (
      user_id integer,
      permission text,
      read boolean,
      write boolean,
      time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, permission),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`, "users_permissions")

  // Create Webtoken Table
  await createTable(`CREATE TABLE IF NOT EXISTS webtokens (
      user_id integer,
      token text PRIMARY KEY,
      browser text,
      time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`, "webtokens")

  await createTable(`CREATE TABLE IF NOT EXISTS confirmation_tokens (
      user_id integer,
      type text,
      token text,
      data text,
      time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (type, token),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);`, "confirmation_tokens")
}

const createTable = (query, table) => {
  return new Promise((resolve, reject) => {
    pool.query(query, (err, result) => {
      if (err) { process.log.error(`Table-gen: Error ${table}: ${err}`) }
      if (err) reject();
      resolve(result);
    });
  })
}

/* --- --- --- --- --- Querys --- --- --- --- --- */

/* --- --- --- Users --- --- --- */

/**
 * Insert a new User
 * @param {String} username
 * @param {String} email
 * @param {String} password
 * @param {String} language
 * @param {String} design
 * @param {String} user_group
 * @param {String} avatar_url
 * @param {String} first_name
 * @param {String} last_name
 */
const UsersCreate = async (username, email, password, language, design, user_group, avatar_url, first_name, last_name) => {
  let returnVal = "SHOULD NOT BE LOGGED EVER";
  const client = await pool.connect() // Start a connection
  try {
    await client.query('BEGIN'); // Start a transaction

    const newUserInsertResult = await client.query(`INSERT INTO users (username, email, password, user_group, avatar_url, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [username, email, password, user_group, avatar_url, first_name, last_name]);
    returnVal = newUserInsertResult.rows[0].id;
    await client.query(`INSERT INTO users_settings (user_id, language, design) VALUES ($1, $2, $3)`, [newUserInsertResult.rows[0].id, language || process.env.FALLBACKLANG, design]);

    await client.query('COMMIT'); // Commit the transaction
  } catch (err) {
    returnVal = err;
    await client.query('ROLLBACK'); // Rollback in case of error
  } finally {
    client.release();  // Release client in finally block
    return returnVal;
  }
}

/**
 * Create or update a User with GitHub OAuth data
 * @param {String} login - GitHub username
 * @param {String} email - GitHub email
 * @param {String} avatar_url - GitHub avatar URL
 * @param {String} name - GitHub full name
 * @param {String} profile_url - GitHub profile URL
 * @returns 
 */
const createUserOrUpdateFromGitHub = async (login, email, avatar_url, name, profile_url) => {
  let returnVal = "SHOULD NOT BE LOGGED EVER";
  return new Promise(async (resolve, reject) => {
    const client = await pool.connect() // Start a connection
    try {
      await client.query('BEGIN'); // Start a transaction
      let newUserInsertResult;

      // Check if the user exists
      const users = await UsersGetByUseridentifyerWithSettings(email);
      if (users.length === 0) {
        // If user does not exist, create new user
        // Note: Adjust the fields according to your table schema
        newUserInsertResult = await client.query(`INSERT INTO users (username, email, password, user_group, avatar_url, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [login, email, null, default_group, avatar_url, name, null]);
        await client.query(`INSERT INTO users_settings (user_id, language, design) VALUES ($1, $2, $3)`, [newUserInsertResult.rows[0].id, process.env.FALLBACKLANG, 'white.center']);
      } else {
        // If user exists, update fields that are null
        const user = users[0];
        // Update avatar_url if it's null in the DB
        if (user.avatar_url === null && avatar_url !== null) {
          await client.query('UPDATE users SET avatar_url = $1 WHERE email = $2', [avatar_url, email]);
        }
      }

      await client.query('COMMIT'); // Commit the transaction
      if (users.length === 0) {
        returnVal = newUserInsertResult.rows[0].id;
      } else {
        returnVal = false;
      }
    } catch (err) {
      await client.query('ROLLBACK'); // Rollback in case of error
      reject(err); // Reject the promise with the error
    } finally {
      client.release();  // Release client in finally block
      resolve(returnVal);
    }
  });
};

/**
 * Create or update a User with Google OAuth data
 * @param {String} name - Google full name
 * @param {String} email - Google email
 * @param {String} picture - Google profile picture URL
 * @param {String} given_name - Google given name
 * @param {String} family_name - Google family name
 * @param {String} locale - Google locale
 * @returns 
 */
const createUserOrUpdateFromGoogle = async (name, email, picture, given_name, family_name, locale) => {
  let returnVal = "SHOULD NOT BE LOGGED EVER";
  return new Promise(async (resolve, reject) => {
    const client = await pool.connect() // Start a connection
    try {
      await client.query('BEGIN'); // Start a transaction
      let newUserInsertResult;

      // Check if the user exists
      const users = await UsersGetByUseridentifyerWithSettings(email);
      if (users.length === 0) {
        // If user does not exist, create new user
        newUserInsertResult = await client.query(`INSERT INTO users (username, email, password, user_group, avatar_url, first_name, last_name, bio) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [name, email, null, default_group, picture, given_name, family_name, null]);
        await client.query(`INSERT INTO users_settings (user_id, language, design) VALUES ($1, $2, $3)`, [newUserInsertResult.rows[0].id, locale || process.env.FALLBACKLANG, 'white.center']);
      } else {
        // If user exists, update fields that are null
        const user = users[0];

        // Update avatar_url if it's null in the DB
        if (user.avatar_url === null && picture !== null) {
          await client.query('UPDATE users SET avatar_url = $1 WHERE email = $2', [picture, email]);
        }
        // Update first_name and last_name if they are null in the DB
        if (user.first_name === null && given_name !== null) {
          await client.query('UPDATE users SET first_name = $1 WHERE email = $2', [given_name, email]);
        }
        if (user.last_name === null && family_name !== null) {
          await client.query('UPDATE users SET last_name = $1 WHERE email = $2', [family_name, email]);
        }
        // Add others
      }

      await client.query('COMMIT'); // Commit the transaction
      if (users.length === 0) {
        returnVal = newUserInsertResult.rows[0].id;
      } else {
        returnVal = false
      }
    } catch (err) {
      await client.query('ROLLBACK'); // Rollback in case of error
      reject(err); // Reject the promise with the error
    } finally {
      client.release();  // Release client in finally block
      resolve(returnVal);
    }
  });
};

/**
 * Get all users
 * @param {Number} offset
 * @param {Number} limit
 * @param {String} sort
 * @param {String} order
 * @param {String} search
 * @returns {Promise<Object>}
 */
const listAllUsersByPage = async (offset, limit, sort, order, search) => {
  try {
    const validSortColumns = ['username', 'email', 'first_name', 'last_name', 'credit', 'user_group'];
    const validOrderDirections = ['asc', 'desc'];

    if (!validSortColumns.includes(sort)) throw new Error('Invalid sort column');
    if (!validOrderDirections.includes(order)) throw new Error('Invalid order direction');

    const blockList = ['credit', 'user_group'];
    const isBlockedColumn = blockList.includes(sort);
    const whereColumn = isBlockedColumn ? 'last_name' : sort;
    const whereCondition = `${whereColumn} ILIKE $1`;

    let query = `
            SELECT * FROM users
            WHERE ${whereCondition}
            ORDER BY ${sort} ${order}
            LIMIT $2 OFFSET $3`;

    let countQuery = `
            SELECT COUNT(*) FROM users
            WHERE ${whereCondition}`;

    const searchPattern = `%${search}%`;
    const countParams = [searchPattern];
    const mainParams = [searchPattern, limit, offset];

    const totalItemsResult = await pool.query(countQuery, countParams);
    const totalItems = parseInt(totalItemsResult.rows[0].count, 10);

    const usersResult = await pool.query(query, mainParams);

    return { totalItems, table: usersResult.rows };
  } catch (err) {
    console.error(err);
    throw err;
  }
};

/**
 * Update the User Email Verification Timestamp
 * @param {Number} user_id 
 * @returns 
 */
const updateUserEmailVerification = (user_id) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET email_verified = CURRENT_TIMESTAMP WHERE id = $1`, [user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Get User Data
 * @param {Number} user_id 
 * @returns {Promise<Array>}
 */
const UsersGet = (user_id) => {
  return new Promise((resolve, reject) => {
    pool.query(`SELECT * FROM users WHERE id = $1`, [user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result.rows)
    })
  })
}

/**
 * Get User Data by identifier
 * @param {String} identifier  
 * @returns {Promise<Array>}
 */
const UsersGetByUseridentifyer = (identifier) => {
  return new Promise((resolve, reject) => {
    pool.query(`SELECT * FROM users WHERE username = $1 OR email = $1`, [identifier], (err, result) => {
      if (err) { reject(err) }
      resolve(result.rows)
    })
  })
}

/**
 * Get USer Data by identifier with settings
 * @param {String} identifier 
 * @returns {Promise<Array>}
 */
const UsersGetByUseridentifyerWithSettings = (identifier) => {
  return new Promise((resolve, reject) => {
    pool.query(`SELECT * FROM users INNER JOIN users_settings ON users.id = users_settings.user_id WHERE username = $1 OR email = $1`, [identifier], (err, result) => {
      if (err) { reject(err) }
      resolve(result.rows)
    })
  })
}

/**
 * twofa_time is used to check if the user had a recent login
 * @param {Number} user_id 
 * @param {String} twofa_token
 * @param {Number} time 
 * @returns {Promise<Array>}
 */
const Updatetwofa_time = (user_id, twofa_token, time = null) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET twofa_time = $1, twofa_token = $2 WHERE id = $3`, [time, twofa_token, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Password
 * @param {Number} user_id
 * @param {String} password
 * @returns {Promise<Array>}
 */
const UpdatePassword = (user_id, password) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [password, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Username
 * @param {Number} user_id 
 * @param {String} username 
 * @returns {Promise<Array>}
 */
const UpdateUserName = (user_id, username) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET username = $1 WHERE id = $2`, [username, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Email
 * @param {Number} user_id
 * @param {String} email
 * @returns {Promise<Array>}
 */
const UpdateUserEmail = (user_id, email) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [email, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User First Name
 * @param {Number} user_id 
 * @param {String} last_name 
 * @returns 
 */
const UpdateUserFirstName = (user_id, first_name) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET first_name = $1 WHERE id = $2`, [first_name, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Last Name
 * @param {Number} user_id 
 * @param {String} last_name 
 * @returns 
 */
const UpdateUserLastName = (user_id, last_name) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET last_name = $1 WHERE id = $2`, [last_name, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Avatar
 * @param {Number} user_id 
 * @param {String} avatar_url 
 * @returns 
 */
const UpdateUserAvatar = (user_id, avatar_url) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [avatar_url, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/* --- --- --- Users Settings --- --- --- */

/**
 * Update the User Design
 * @param {Number} user_id 
 * @param {String} design 
 * @returns {Promise<Array>}
 */
const setUserDesign = (user_id, design) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users_settings SET design = $1 WHERE user_id = $2`, [design, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Language
 * @param {Number} user_id 
 * @param {String} language 
 * @returns 
 */
const setUserLang = (user_id, language) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users_settings SET language = $1 WHERE user_id = $2`, [language, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Credit
 * @param {Number} user_id 
 * @param {Number} credit 
 * @returns 
 */
const setUserCredit = (user_id, credit) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET credit = $1 WHERE id = $2`, [credit, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Update the User Credit by decrementing
 * @param {Number} user_id 
 * @param {Number} credit 
 * @returns 
 */
const decrementUserCredit = (user_id, credit) => {
  return new Promise((resolve, reject) => {
    pool.query(`UPDATE users SET credit = credit - $1 WHERE id = $2`, [credit, user_id], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/* --- --- --- User Permissions --- --- --- */

/**
 * Insert or Update User Permissions
 * @param {Number} user_id 
 * @param {String} permission 
 * @param {Boolean} read 
 * @param {Boolean} write 
 * @returns 
 */
const AddPermissionToUser = (user_id, permission, read, write) => {
  return new Promise((resolve, reject) => {
    pool.query(`INSERT INTO users_permissions (user_id, permission, read, write) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, permission) DO UPDATE SET read = $3, write = $4`, [user_id, permission, read, write], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * This function is used to get a list of permissions of a user
 * @param {Number} user_id
 * @returns {Promise}
 */
const GetPermissionFromUser = function (user_id) {
  return new Promise(function (resolve, reject) {
    pool.query(`SELECT permission, read, write FROM users_permissions WHERE user_id = $1`, [
      user_id
    ], (err, result) => {
      if (err) { reject(err) }
      resolve(result);
    });
  });
}

/**
 * This function is used to remove a permission from a user
 * @param {String} user_id
 * @param {String} permission
 * @returns {Promise}
 */
const DelPermissionFromUser = function (user_id, permission) {
  return new Promise(function (resolve, reject) {
    pool.query(`DELETE FROM users_permissions WHERE user_id = $1 AND permission = $2`, [
      user_id, permission
    ], (err, result) => {
      if (err) { reject(err) }
      resolve(result);
    });
  });
}

/**
 * This function is used to update r/w of a permission of a user
 * @param {String} user_id
 * @param {String} permission
 * @param {boolean} read
 * @param {boolean} write
 * @returns {Promise}
 */
const UpdatePermissionFromUser = function (user_id, permission, read, write) {
  return new Promise(function (resolve, reject) {
    pool.query(`UPDATE users_permissions SET read = $3, write = $4 WHERE user_id = $1 AND permission = $2`, [
      user_id, permission, read, write
    ], (err, result) => {
      if (err) { reject(err) }
      resolve(result);
    });
  });
}

/* --- --- --- Inventory --- --- --- */
/**
 * 
 * @param {Number} offset 
 * @param {Number} limit 
 * @param {String} sort 
 * @param {String} order 
 * @param {String} search 
 * @returns 
 */
const listInventory = async (offset, limit, sort, order, search) => {
  try {
    const validSortColumns = [
      'article', 'article_type', 'article_number', 'price',
      'stock_xs', 'stock_s', 'stock_m', 'stock_l', 'stock_xl', 'stock_xxl'
    ];
    const validOrderDirections = ['asc', 'desc'];

    const blockList = ['price', 'stock_xs', 'stock_s', 'stock_m', 'stock_l', 'stock_xl', 'stock_xxl'];
    const isBlockedColumn = blockList.includes(sort);
    const whereColumn = isBlockedColumn ? 'article_number' : sort;
    const whereCondition = `${whereColumn} ILIKE $1`;

    if (!validSortColumns.includes(sort)) throw new Error('Invalid sort column');
    if (!validOrderDirections.includes(order)) throw new Error('Invalid order direction');

    let query = `
          SELECT id, uuid, article, article_type, article_number, price,
                 stock_xs, stock_s, stock_m, stock_l, stock_xl, stock_xxl
          FROM inventory
          WHERE ${whereCondition}
          ORDER BY ${sort} ${order}
          LIMIT $2 OFFSET $3
      `;

    let countQuery = `
          SELECT COUNT(*) FROM inventory
          WHERE ${whereCondition}
      `;

    // Parameters for the queries
    const searchPattern = `%${search}%`;
    const countValues = [searchPattern];
    const mainValues = [searchPattern, limit, offset];

    // Query to get total number of items matching the search
    const totalItemsResult = await pool.query(countQuery, countValues);
    const totalItems = parseInt(totalItemsResult.rows[0].count, 10);

    // Query to get paginated, sorted items matching the search
    const inventoryResult = await pool.query(query, mainValues);

    return { totalItems, table: inventoryResult.rows };
  } catch (err) {
    console.error(err);
    throw err;
  }
};

/**
 * Add a new item to the inventory
 * @param {String} article 
 * @param {String} article_type 
 * @param {String} article_number 
 * @param {Number} price 
 * @param {String} description 
 * @param {String} gender 
 * @param {Number} stock_xs 
 * @param {Number} stock_s 
 * @param {Number} stock_m 
 * @param {Number} stock_l 
 * @param {Number} stock_xl 
 * @param {Number} stock_xxl 
 * @returns 
 */
const addInventoryItem = async (article, article_type, article_number, price, description, gender, stock_xs, stock_s, stock_m, stock_l, stock_xl, stock_xxl) => {
  try {
    const result = await pool.query(`
          INSERT INTO inventory (article, article_type, article_number, price, description, image, gender, stock_xs, stock_s, stock_m, stock_l, stock_xl, stock_xxl)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
      `, [article, article_type, article_number, price, description, null, gender, stock_xs, stock_s, stock_m, stock_l, stock_xl, stock_xxl]);

    return result.rows[0];
  } catch (err) {
    console.error(err);
    throw err;
  }
};

/**
 * Delete an item from the inventory
 * @param {String} id 
 * @returns 
 */
const deleteInventoryItem = async (id) => {
  try {
    const result = await pool.query(`
          DELETE FROM inventory
          WHERE id = $1
          RETURNING *
      `, [id]);

    return result.rows[0];
  } catch (err) {
    console.error(err);
    throw err;
  }
};

/**
 * Set the stock of an item in the inventory
 * @param {String} id 
 * @param {String} stock 
 * @param {Number} new_stock 
 * @returns 
 */
const setCollumValue = async (id, stock, new_stock) => {
  try {
    const result = await pool.query(`
        UPDATE inventory
        SET ${stock} = $1
        WHERE id = $2
        RETURNING *
    `, [new_stock, id]);

    return result.rows[0];
  } catch (err) {
    console.error(err);
    throw err;
  }
};

/* --- --- --- Shop --- --- --- */

const SeachShopItems = async (minPrice, maxPrice, ArticleType, search) => {
  const client = await pool.connect();
  try {
    let query = `
      SELECT * FROM inventory 
      WHERE price BETWEEN $1 AND $2 
      AND (article ILIKE $3 OR description ILIKE $3)
    `;
    let values = [minPrice, maxPrice, `%${search}%`];

    if (ArticleType !== 'All') {
      query = `
        SELECT * FROM inventory 
        WHERE price BETWEEN $1 AND $2 
        AND article_type = $3
        AND (article ILIKE $4 OR description ILIKE $4)
    `;
      values = [minPrice, maxPrice, ArticleType, `%${search}%`];
    }

    const result = await client.query(query, values);
    return result.rows;
  } finally {
    client.release();
  }
}

/* --- --- --- Webtokens --- --- --- */

/**
 * Insert a new Webtoken
 * @param {Number} user_id
 * @param {String} token
 * @param {String} browser
 * @returns 
 */
const WebtokensCreate = (user_id, token, browser) => {
  return new Promise((resolve, reject) => {
    pool.query(`INSERT INTO webtokens (user_id, token, browser) VALUES ($1, $2, $3)`, [user_id, token, browser], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/**
 * Get data from a Webtoken
 * @param {String} token 
 * @returns 
 */
const WebtokensGet = (token) => {
  return new Promise((resolve, reject) => {
    // Join the users, userssettings table with the webtokens table
    pool.query(`SELECT webtokens.user_id, webtokens.token, webtokens.browser, webtokens.time, users_settings.design, users_settings.language, users.puuid, users.username, users.user_group, users.avatar_url FROM webtokens INNER JOIN users ON webtokens.user_id = users.id INNER JOIN users_settings ON webtokens.user_id = users_settings.user_id WHERE token = $1`, [token], (err, result) => {
      if (err) { reject(err) }
      resolve(result.rows)
    })
  })
}

/**
 * Remove a Webtoken from the database
 * @param {String} token 
 * @returns 
 */
const WebtokensDelete = (token) => {
  return new Promise((resolve, reject) => {
    pool.query(`DELETE FROM webtokens WHERE token = $1`, [token], (err, result) => {
      if (err) { reject(err) }
      resolve(result)
    })
  })
}

/* --- --- --- Exports --- --- --- */

const user = {
  create: UsersCreate,
  oauth: {
    git: createUserOrUpdateFromGitHub,
    google: createUserOrUpdateFromGoogle
  },
  get: UsersGet,
  getByUseridentifyer: UsersGetByUseridentifyer,
  getByUseridentifyerWithSettings: UsersGetByUseridentifyerWithSettings,
  settings: {
    updateDesign: setUserDesign,
    updateLanguage: setUserLang
  },
  update: {
    twofa_time: Updatetwofa_time,
    password: UpdatePassword,
    username: UpdateUserName,
    first_name: UpdateUserFirstName,
    last_name: UpdateUserLastName,
    email: UpdateUserEmail,
    verifyEmail: updateUserEmailVerification,
    avatar: UpdateUserAvatar,
  },
  credit: {
    set: setUserCredit,
    decrement: decrementUserCredit
  },
  delete: {
  },
  permission: {
    add: AddPermissionToUser,
    get: GetPermissionFromUser,
    del: DelPermissionFromUser,
    update: UpdatePermissionFromUser
  },
  admin: {
    listUsers: listAllUsersByPage,
    setCredit: setUserCredit
  }
}

const shop = {
  search: SeachShopItems,
  inventory: {
    list: listInventory,
    create: addInventoryItem,
    delete: deleteInventoryItem,
    setCollumValue: setCollumValue
  }
}

const webtoken = {
  create: WebtokensCreate,
  get: WebtokensGet,
  delete: WebtokensDelete
}

module.exports = {
  createTables,
  shop,
  user,
  webtoken
}