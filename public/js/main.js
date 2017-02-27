
/**
* Class ListDataAdapter for preparing data for groupedList control
* @class ListDataAdapter
*/
class ListDataAdapter {
	/**
	* Create instance of ListDataAdapter
	* @constructor 
	* @param {string} url - Url for load json-data
	* @param {function} stringifier - Function for create string representation of list item
	*/
	constructor (url, stringifier) {
		if (typeof url != 'string' || !url) {
			throw new TypeError('Illegal argument "url"');
		}
		if (typeof stringifier != 'function') {
			throw  new TypeError('Illegal argument "stringifier"');
		}
		/**
		* @private
		* @type {string}
		 */
		this._url = url;
		/**
		* @private
		* @type {function}
		 */
		this._stringifier = stringifier;
		/**
		* @private
		* @type {object[]}
		 */
		this._list = [];
		/**
		* @private
		* @type {object[]}
		 */
		this._queue = [];
		/**
		* @private
		* @type {string}
		 */
		this._status = null;
	}

	/**
	* Return promise for grouped list of objects
	* @public
	* @param {function} groupper - Function for define group of list item
	* @param {boolean} [needReload] - Flag for reload fresh data from url (optional)
	* @return {Promise}
	*/
	list (groupper, needReload) {
		if (typeof groupper != 'function') {
			throw  new TypeError('Illegal argument "groupper"');
		}

		if (!needReload && this._status == 'ready') {
			return Promise.resolve(this._prepare(groupper));
		}

		if (needReload || this._status == null) {
			$.ajax({
				type: 'GET',
				url: this._url,
				dataType: 'json',
			})
			.then((data, status, xhr) => {
				if (Array.isArray(data)) {
					this._list = data;
					this._queue.forEach(o => o.res.call(null));
				}
				else {
					this._list = [];
					let err = `Data loaded from ${this._url} has unknown format`;
					this._queue.forEach(o => o.rej.call(null, err));
				}
				this._queue = [];
				this._status = 'ready';
			})
			.catch((xhr, status, msg) => {
				this._list = [];
				let err = `Unable load from ${this._url} : ${msg}`;
				this._queue.forEach(o => o.rej.call(null, err));
				this._queue = [];
				this._status = 'ready';
			});
			this._status = 'load';
		}
		return new Promise((resolve, reject) => {
			this._queue.push({res:() => resolve(this._prepare(groupper)), rej:reject});
		});
	}

	/**
	* Return grouped list of objects
	* @private
	* @param {function} groupper - Function for define group of list item
	* @return {object[]}
	*/
	_prepare (groupper) {
		let result = {};
		for (let item of this._list) {
			let group = groupper.call(null, item);
			if (!(group in result)) {
				result[group] = [];
			}
			result[group].push(this._stringifier.call(null, item));
		}
		return result;
	}
}



/**
* jQuery-plugin groupedList
*/
(function($){
	var methods = {
		/**
		* Initialize grouped list control
		* @public
		* @method init
		* @param {object} options - Arguments
		* @param {ListDataAdapter} options.adapter - Source of data for grouped list
		* @param {function} [options.groupper] - Function for define group of list item (optional)
		* @param {object} [options.groupNames] - Map of group names (optional)
		* @return {object}
		*/
		init: function (options) {
			if (typeof options != 'object') {
				console.error('groupedList: Illegal arguments:', [].slice.call(arguments));
				return;
			}
			if (!(options.adapter instanceof ListDataAdapter)) {
				console.error('groupedList: Illegal argument "options.adapter":', options.adapter);
				return;
			}
			if (options.groupper != null && typeof options.groupper != 'function') {
				console.error('groupedList: Illegal argument "options.groupper":', options.groupper);
				return;
			}
			if (options.groupNames != null && typeof options.groupNames != 'object') {
				console.error('groupedList: Illegal argument "options.groupNames":', options.groupNames);
				return;
			}
			this.options = $.extend(false, {/*default*/}, options);
			methods.update.call(this);
			this.scroll(methods._onScroll);
			return this;
		},

		/**
		* Update grouped list control
		* @public
		* @method update
		* @param {object} [options] - Arguments (optional)
		* @param {function} [options.groupper] - Function for define group of list item (optional)
		* @param {object} [options.groupNames] - Map of group names (optional)
		* @param {boolean} [options.reload] - Flag for reload fresh data from url (optional)
		* @return {object}
		*/
		update: function (options) {
			if (options != null && typeof options != 'object') {
				console.error('groupedList: Illegal arguments:', [].slice.call(arguments));
				return;
			}
			if (options) {
				if (options.groupper != null && typeof options.groupper != 'function') {
					console.error('groupedList: Illegal argument "options.groupper":', options.groupper);
					return;
				}
				if (options.groupNames != null && typeof options.groupNames != 'object') {
					console.error('groupedList: Illegal argument "options.groupNames":', options.groupNames);
					return;
				}
				if (options.groupper) {
					this.options.groupper = options.groupper;
				}
				if (options.groupNames) {
					this.options.groupNames = options.groupNames;
				}
			}
			this.options.adapter.list(this.options.groupper, options && options.reload)
			.then(data => {
				let gNames = this.options.groupNames;
				data = methods._sort(data, gNames);
				this.each(function () {
					let parts = [];
					for (let g in data) {
						parts.push(methods._tmpl(gNames ? gNames[g] || g : g, data[g]));
					}
					let $this = $(this);
					$this.html(parts.join(''));
					$this.data('grouped-list', null);
				});
			}, err => console.log(err));
		},

		/**
		* Fill group template
		* @private
		*/
		_tmpl: function (title, items) {
			let parts = [];
			parts.push('<div class="grouped-list-group">');
			parts.push(`<div class="grouped-list-title">${title}</div>`);
			items.forEach(item => parts.push(`<div class="grouped-list-item">${item}</div>`));
			parts.push('</div>');
			return parts.join('');
		},

		/**
		* Final alphabetical sorting of data before output
		* @private
		*/
		_sort: function (data, groupNames) {
			let gs = Object.keys(data);
			gs.sort(groupNames
				? (a, b) => { let x = groupNames[a] || a, y = groupNames[b] || b; return x < y ? -1 : (x == y ? 0 : 1); }
				: undefined
			);
			let result = {};
			for (let g of gs) {
				let list = data[g].slice();
				list.sort();
				result[g] = list;
			}
			return result;
		},

		/**
		* Makes css effect for fixed title blocks
		* @private
		*/
		_onScroll: function (evt) {
			let self = evt.target;
			let $self = $(self);
			let y0 = self.scrollTop + self.offsetTop;
			let data = $self.data('grouped-list') || {};
			if (!data.titles) {
				data.titles = $self.find('.grouped-list-title').toArray();
				$self.data('grouped-list', data);
			}
			for (let e of data.titles) {
				let p = e.parentNode;
				let y = p.offsetTop - y0;
				let t = 0;
				if (y < 0) {
					let h = p.offsetHeight;
					if (-y < h) {
						h -= e.offsetHeight;
						t = -y < h ? -y : h;
					}
				}
				e.style.transform = 0 < t ? 'translate3d(0, ' + t + 'px, 0)' : 'none';
			}

		}
	};

	$.fn.groupedList = function () {
		var name, args = [].slice.call(arguments);
		if (args.length) {
			var a0 = args[0];
			if (a0 == null || typeof a0 == 'string') {
				name = args.shift();
			}
		}
		name = name || 'init';
		if (name in methods) {
			var result = methods[name].apply(this, args);
			if (typeof result != 'undefined') {
				return result;
			}
		}
		else {
			console.error('groupedList: Unknown method "' + name + '"');
		}
		return this;
	};
})(jQuery);



/**
* Samples of using of Group List controls
*/
$(document).ready(() => {
	let $root = $('#app-root');

	/**
	* Data adapter for all persons control
	*/
	let personsAdapter = new ListDataAdapter('data/persons.json', item => `<span>${item.lastName}</span> ${item.firstName}`);

	/**
	* Add 2 control for persons
	*/
	$root.append('<div class="grouped-list" id="persons-1"></div>');
	let $persons_1 = $root.children('#persons-1').groupedList({
		adapter: personsAdapter,
		groupper: item => item.lastName.charAt(0)
	});

	$root.append('<div class="grouped-list" id="persons-2"></div>');
	let $persons_2 = $root.children('#persons-2').groupedList({
		adapter: personsAdapter,
		groupper: item => item.firstName.charAt(0)
	});

	/**
	* Data adapter for all regions control
	*/
	let regionsAdapter = new ListDataAdapter('data/regions.json', item => item.name);

	/**
	* Add 3 control for regions
	*/
	// Separates in array all group stuff for convenient use in toys below
	let groupStuff = [
		{
			groupper: item => item.fedreg,
			groupNames: {
				"1":"Дальневосточный ф.о.",
				"2":"Крымский ф.о.",
				"3":"Приволжский ф.о.",
				"4":"Северо-Западный ф.о.",
				"5":"Северо-Кавказский ф.о.",
				"6":"Сибирский ф.о.",
				"7":"Уральский ф.о.",
				"8":"Центральный ф.о.",
				"9":"Южный ф.о."
			}
		},
		{
			groupper: item => item.type,
			groupNames: {
				"1":"Области",
				"2":"Республики",
				"3":"Края",
				"4":"Автономные округи",
				"5":"Города ф.з."
			}
		},
		{
			groupper: item => item.name.charAt(0)
		},
	];

	let $regions = [];
	for (let i = 0; i < 3; i++) {
		$root.append(`<div class="grouped-list" id="regions-${i}"></div>`);
		$regions[i] = $root.children(`#regions-${i}`).groupedList({
			adapter: regionsAdapter,
			groupper: groupStuff[i].groupper,
			groupNames: groupStuff[i].groupNames
		});
	}

	/**
	* Add some interactive toys
	*/
	$regions.forEach((e, i) => {
		$(e).after(`<select class="toy" data-target="${i}"><option ${i == 0 ? 'selected' : ''}>&lt; Фед.окр.</option><option ${i == 1 ? 'selected' : ''}>&lt; Типы</option><option ${i == 2 ? 'selected' : ''}>&lt; Алфавит</option></select>`);
	});

	$root.children('.toy').on('change', evt => {
		let s = evt.target;
		let stuff = groupStuff[s.selectedIndex];
		$regions[s.dataset.target].groupedList('update', {
			groupper: stuff.groupper,
			groupNames: stuff.groupNames
		});
	});
});
