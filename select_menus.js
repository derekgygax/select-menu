"use strict";

// Written from scratch by Derek Gygax


var SelectMenus = {
    
    Singleselect: {
      setup: function(field_name, existing_filters, field_label){
          this.type = "single";
          this.field_name = field_name;
          this.field_label = field_label;
          this.current_filters = {};
          for (var i=0; i < existing_filters.length; i++){
              this.current_filters[existing_filters[i].value] = true;
          }          
      },
      
      getMenu: function(){
          return $("select[name=" + this.field_name + "]")
      },
      
      markAsLoading: function(){
          var $menu = this.getMenu();
          $menu.addClass("disabled")
              .attr("aria-disabled", "true")
              .addClass("loading")
              .attr("tabindex", "-1")
              .attr("aria-busy", "true");
          var $selectWrapper = $menu.closest(".advanced-search-select");
          if (!$selectWrapper.hasClass("disabled")){
              $selectWrapper.addClass("disabled");
          }
      },
      
      buildMenuOption: function(filter){
          // build a menu_option for select menu
          var $menu_option = $("<option />")
              .val(filter.value)
              .text(filter.label);
          return $menu_option;          
      },
      
      finishedAjax: function(){
          var $menu = this.getMenu();
          // Always mark as not loading
          $menu.removeClass("loading")
              .attr("aria-busy", "false");
          // If the new drop down has more than the "select" option
          // make it able to be clicked
          if ($menu.children().slice(1).length > 0){
              $menu.removeClass("disabled")
              .removeAttr("tabindex")
              .removeAttr("aria-disabled");            
              var $selectWrapper = $menu.closest(".advanced-search-select");
              $selectWrapper.removeClass("disabled");
          }
      }
    },
    
    
    Multiselect: {
        // This is a static variable that will not change depending on the instance
        SELECT_ALL_THRESHOLD :20,
        // the ratio of selected menu_options to available menu_options that will trigger
        // an inversion:
        INVERSION_THRESHOLD : 0.8,
        
        setup: function(data_name, existing_filters, data_label){
            this.type = "multiple";
            this.data_name = data_name;
            this.data_label = data_label;
            // The following needs to be referred to as new
            // So 'this' makes the correct references within the function
            // Could improve and figure this out in the future......
            this.label_updater = new this.MultiselectLabelUpdater(data_name).scheduleUpdate();
            this.existing_filters = existing_filters;
            this.available_values = this.getAvailableValues();
            this.do_invert = this.setDoInvert();
            this.current_filters = {};
            for (var i=0; i < existing_filters.length; i++){
                this.current_filters[existing_filters[i].value] = true;
            }
            // For now this is taken out.
            // This allows for the search outlined in the function to be
            // performed. In the future we will re-visit this issue
            // and address it.
//            this.populateFieldSetData();
        },
        
        isActive: function(){
            // If the multiselect menu is open then it is active so
            // you return true
            var $field_set = this.getFieldSet();
            if ($field_set.hasClass("active")){
                return true;
            } else {
                return false;
            }
        },
        
        setScrollTop: function(keyPressed){
            // Set the scroll position of the select menu
            // This function sets it to the first time the letter passed in
            // is at the beginning of the input value, ignoring articles
            // This function may be strange. It is written for display
            // purpose and not functionality like most of this object is
            var _this = this;
            var scrollTopPos = 0;
            var $chk_menu = this.getMenu();
            
            var removeArticlesFromValue = function(value){
                // This function removes some articles from the start of the
                // value. Including things like 'the' and 'la'. We are only
                // doing some as weird things could happen if we removed things
                // like 'a', which is an article in portuguese
                value = value.replace(
                    /^(the |el |la |lo |le |die |der |das |de |het |ka |ke |az |na |il |di |dem )/gi,
                    ""
                );
                return value;
            };
            
            $chk_menu.find("li").each(function(){
                var liHeight = this.getBoundingClientRect().height;
                var value = $(this).find("input").val().toLowerCase();
                // Skip Select All
                if (value == "select all"){
                    scrollTopPos += liHeight;
                    return true;
                }
                // Remove some articles from the value if you are looking
                // at a newspaper title
                if ("partof_title" == _this.data_name){
                    value = removeArticlesFromValue(value);
                }
                if (value.startsWith(keyPressed)){
                    // Set the scrolling position
                    $chk_menu.scrollTop(scrollTopPos);
                    return false;
                }
                scrollTopPos += liHeight;
            });            
        },
        
        populateFieldSetData: function(){
            // Initially populating the object $field_set with
            // $field_set.data("selected"). This is the data being 
            // loaded from the very beginning. This needs to be done on setup
            // to trigger a search in the following scenario
            // 1. Values are selected in a multiselect and the 'Search' button
            // is clicked to performed a search
            // 2. On the results page you unselect all the previous select
            // and leave that drop down.
            // Without the following code a search will not be performed
            // Data put in field_set here is used in ui/js/jquery.dropdown.js
            // ui/js/jquery.dropdown.js also rebuilds this part of the object 
            // if a click is done in the multiselect and it is closed
            var selected_indexes = [];
            var $field_set = this.getFieldSet();
            $field_set.find("ul.multiple-checkbox input").each(function(index, input) {
                if (input.checked) {
                    selected_indexes.push(index);
                }
            });
            $field_set.data("selected", selected_indexes);
        },
        
        emptyFieldSetData: function(){
            // The field set data must be emptied for each mutiselect that
            // was changed
            // This will be done after every ajax call
            // This allows for the following scenario to take place
            // 1. Choose Italy in the country menu
            // 2. Choose the first 2 states
            // 3. Change the country to United States
            // 4. Choose the first 2 states
            // 5. A search takes place to repopulate the downstream menus
            var $field_set = this.getFieldSet();
            $field_set.data("selected", []);
        },
        
        finishedAjax: function(){
            this.available_values = this.getAvailableValues();
            this.removeLoadingMarker();
            this.resetButtonDisplay();
            this.enable();
        },
        
        markAsLoading: function(){
          var $button = this.getButton();
          $button.addClass("disabled")
              .attr("aria-disabled", "true")
              .addClass("loading")
              .attr("tabindex", "-1")
              .attr("aria-busy", "true");
          $button.find('span.button-title')
              .attr("aria-busy", "true");
          $button.find('span.selected-values')
              .attr("aria-busy", "true");          
            
        },
        
        getAvailableValues: function(){
            var $chk_menu = this.getMenu();
            var available_values = $chk_menu.find("input:checkbox")
                .map(function(index, el) {
                    if (el.value !== "Select All" && el.value !== '') {
                        return el.value;
                    } else {
                        // leave out the "Select All" menu_option:
                        return null;
                    }
                }).get(); // map returns a jQuery object, so we use .get() to retrieve the array of values   
            return available_values;
        },
        
        setDoInvert: function(){
            var do_invert = true;
            // if there are no existing filters or all existing filters are
            // "negative filters", we can still run this through the
            // get_inverted_params function. however, if only
            // "positive filters" exist, then we should not invert.
            for (var i = 0; i < this.existing_filters.length; i++) {
                var filter = this.existing_filters[i];
                // cant use key.endsWith('!') here because it causes a ghostdriver (Selenium) error
                if (filter.key.indexOf('!') === -1) {
                    do_invert = false;
                    break;
                }
            }
            return do_invert;
        },
        
        getFieldSet: function(){
            return $('fieldset.loc-dropdown[data-name=' + this.data_name + ']');
        },
        
        getMenu: function(){
            return this.getFieldSet().find("ul.multiple-checkbox");
        },
        
        getButton: function(){
            return $("a.multiple-checkbox-button[data-name=" + this.data_name + "]");
        },
        
        uncheckMenuChildren: function(){
          var $menu = this.getMenu();
          var $options = $menu.children();
          $options.removeClass('checked');
          $options.find('input').prop('checked', false);
        },
        
        removeLoadingMarker: function(){
            var $button = this.getButton();
            $button.removeClass("loading").attr("aria-busy", "false");
        },
        
        resetButtonDisplay: function(){
            var $button = this.getButton();
            $button.find('span.button-title').removeClass('screen-readers-only');
            $button.find('span.selected-values').text('').attr('aria-hidden', true);
        },
        
        leftPad: function(inputNumber, numLeftZeros){
            // function to add left padded 0's to a number
            // this is so asci sorting works correctly
            // if our input number is an int and not a string, let's make it a string:
            var input_num_str = '' + inputNumber,
                left_zeros = [],
                i;
            for (i = 0; i < (numLeftZeros - input_num_str.length); i++) {
                left_zeros.push('0');
            }
            return left_zeros.join('') + input_num_str;                
        },
        
        buildMenuOption: function(filter, idNum){
            // build a menu_option for a checkbox menu
            // make an id number string for checkbox labels (left-padded with zeros):
            var idNumber = this.leftPad(idNum, 5);
            var chkbox_label = this.data_name + "-checkbox-" + idNumber;
            var $input = $("<input />")
                .attr("type", "checkbox")
                .attr("name", this.data_name)
                .attr("id", chkbox_label)
                .val(filter.value);
            var $labeled_input = $("<label />")
                .attr("for", chkbox_label)
                .html($input.prop("outerHTML") + filter.label);
            var $li = $("<li class='multiple-checkbox-item'>");
            return $li.append($labeled_input);            
        },
        
        enable: function(){
            // If the multiselect has more than just the 'Select All'
            // Meaning there is more li than 1, then get rid of the disable
            if (this.available_values.length > 0){
                var $button = this.getButton();
                $button.removeClass("disabled")
                    .removeAttr("tabindex")
                    .removeAttr("aria-disabled");                  
            }
        },
        
        get_inverted_params: function(selected_values, ajaxCall){
            // this function inverts the query when the ratio of selected menu_options to
            // available menu_options is above some threshold.

            var _this = this;
            
            var filter_details_array = [];

            if (this.existing_filters === undefined) {
                this.existing_filters = [];
            }

            var num_selected = selected_values.length;
            var menu_options = this.available_values.filter(function(menu_option) {
                // filter out any "Select All" menu_options
                return menu_option !== "Select All" && menu_option !== '';
            });

            var num_available = menu_options.length;

            if (num_selected >= num_available
            && this.existing_filters.length === 0
            && num_available >= this.SELECT_ALL_THRESHOLD) {
                filter_details_array.push({
                    'facet': this.data_name,
                    'key': this.data_name,
                    'value': 'SelectAll'
                });
                return filter_details_array;
            }

            var selected_set = {};
            $.each(selected_values, function(index, value) {
                selected_set[value] = true;
            });
            var menu_options_set = {};
            $.each(menu_options, function(index, value) {
                menu_options_set[value] = true;
            });
            
            var ratio = 1.0 * num_selected / num_available;
            if (num_available < this.SELECT_ALL_THRESHOLD || ratio < this.INVERSION_THRESHOLD) {
                // when the number of menu_options is small enough, we aren't
                // concerned with inverting the query.
                // same when the number of selections is small enough.
                $.each(selected_values, function(index, selected_value) {
                    filter_details_array.push({
                        'facet': _this.data_name,
                        'key': _this.data_name,
                        'value': selected_value
                    });
                });
                // Currently the code below is causing problems for the ajax
                // call. I dont think we need this code but for now this is
                // the safest way to fix it
                if (!ajaxCall){
                    $.each(this.existing_filters, function(index, existing_filter) {
                        if (menu_options_set[existing_filter.value]
                        && !selected_set[existing_filter.value]) {
                            filter_details_array.push(existing_filter);
                        }
                    });
                }
            } else {
                // invert the query:
                $.each(menu_options, function(index, menu_option) {
                    if (!selected_set[menu_option]) {
                        filter_details_array.push({
                            'facet': _this.data_name,
                            'key': _this.data_name + '!',
                            'value': menu_option
                        });
                    }
                });
                $.each(this.existing_filters, function(index, existing_filter) {
                    filter_details_array.push(existing_filter);
                });
            }

            return filter_details_array;            
        },
        
        processValues: function(selected_values){
            if (!selected_values){
                return;
            }
            var $chk_menu = this.getMenu();
            var $selectAll = $chk_menu.find('li.multiple-checkbox-all input');
            if (this.do_invert && this.available_values.length >= this.SELECT_ALL_THRESHOLD) {
                // Apologies for the cyclomatic complexity of this block...
                if (selected_values.length >= this.available_values.length) {
                    if (this.existing_filters.length === 0) {
                        // if there are no existing filters, and over some threshold of
                        // available menu_options, we can use the "SelectAll" parameter:
                        $chk_menu.empty();
                        var $new_element = $('<input type="hidden"/>')
                              .attr("name", this.data_name)
                              .val("SelectAll");
                        $chk_menu.append($new_element);
                    } else {
                        // existing_filters is not empty and everything is checked:
                        // just post the existing filters:
                        // This is taking into account the previous choice
                        // It is thinking you didn't cross a threshold the
                        // first time and so you won't this time
                        $chk_menu.empty();
                        $.each(this.existing_filters, function(index, filter_details) {
                            var $new_element = $('<input type="hidden"/>')
                                .attr("name", filter_details.key)
                                .val(filter_details.value);
                            $chk_menu.append($new_element);
                        });
                    }
                } else {
                    var filter_details_array = this.get_inverted_params(
                        selected_values,
                        false
                    );
                    if (filter_details_array.length > 0) {
                        $chk_menu.empty();
                        $.each(filter_details_array, function(index, filter_details) {
                            var $new_element = $('<input type="hidden"/>')
                                .attr("name", filter_details.key)
                                .val(filter_details.value);
                            $chk_menu.append($new_element);
                        });
                    }
                }
            } else {
                // all filters are positive -- which means we just post what
                // is selected, ignoring "Select All" if it is selected.
                if ($selectAll.is(":checked")) {
                  $selectAll.remove();
                }
            }            
        },

        // Function used to update the label on the multiselect dropdown
        MultiselectLabelUpdater: function(data_name) {
            /*
              This is a way to update the labels on the multi-checkbox menu buttons
              that is easier to manage than the window load/click/change event listener.
             */

            var REFRESH_RATE = 200; //milliseconds
            var self = this;



            self.newChanges = false;
            var $fieldset = $('fieldset[data-name=' + data_name + ']');
            self.$menu = $fieldset.find('ul.multiple-checkbox');
            var $button = $('a.multiple-checkbox-button[data-name=' + data_name +']');
            self.$button_title = $button.find('.button-title');
            self.$selected_values = $button.find('.selected-values');

            self.scheduleUpdate = function() {
                self.newChanges = true;
                return self;
            };

            self.run = function() {
                setTimeout(function() {
                    if (self.newChanges) {
                        var outputNumber = self.$menu.find('input:checked')
                        .filter(function() {
                            return this.value !== "Select All" && this.value !== '';
                        }).length;

                        if (outputNumber === 0) {
                            self.$button_title.removeClass('screen-readers-only');
                            self.$selected_values.text('');
                        } else if(outputNumber > 0 && outputNumber < 2) {
                            var outputValue = $.map(self.$menu.find('input:checked'),
                                    function(el) {
                                var label_text = $(el).closest('label').text();
                                if (label_text.indexOf("Select All") > -1) {
                                    return null;
                                } else {
                                    return label_text;
                                }
                            }
                            ).join(', ');
                            self.$button_title.addClass('screen-readers-only');
                            self.$selected_values.text(outputValue);
                        } else {
                            self.$button_title.addClass('screen-readers-only');
                            self.$selected_values.text(self.$button_title.text() +"(" + outputNumber + ")" );



                        }
                        self.newChanges = false;
                    }

                    self.run();
                }, REFRESH_RATE);
            };

            self.run();
        },
    },
    
    
// ===========================================================================
//    Select_Menus functions
    setup: function(facet_trail, facet_fields, facet_labels){
        var _this = this;
        // Have an object that holds the single selects and the multiselects
        this.selects = {};
        // Record what the existing filters are for each multiselect
        var existing_filters = {};
        
        var duplicatSelectFunctions = {
            
            deleteCurrentFilters: function(){
                if (this.hasOwnProperty("current_filters")){
                    delete this.current_filters;
                }
            },
            // The current filters are changing so delete the currently filters
            // object and make a new one
            change_current_filters: function(selected_values){
                this.deleteCurrentFilters();
                this.current_filters = {};
                for (var i=0; i < selected_values.length; i++){
                    this.current_filters[selected_values[i]] = true;
                }
            },
            
            getCurrentFiltersAsArray: function(){
                var filters = [];
                for (var value in this.current_filters){
                    filters.push(value);
                }
                return filters;
            },
            
            removeSelectsFromMenu: function(){
                // This removes all the options or multiselects from the menu
                // except 1 which is the 'Select All' or the 'Select' text
                this.deleteCurrentFilters();
                var $menu = this.getMenu();
                $menu.children().slice(1).remove();
            },
            
            addToMenu: function(newFilters){
                // Used to add to the menu in the select
                var $menu = this.getMenu();
                for (var i = 0; i < newFilters.length; i++){
                    var filter = newFilters[i];
                    var $menuOption = this.buildMenuOption(
                        filter,
                        i
                    );
                    $menu.append($menuOption);
                }
            }
        };
        // Add the duplicateSelectFunctions to each select object
        // IF YOU DID INHERITANCE CORRECTY YOU WOULDN'T NEED THIS!!
        // But the way you have it constructed you would be trying
        // to inherit while creating. You want this.Multiselect to inherit
        // this.Singleselect
        // Also do you really want to define new objects like this OR
        // do you want the actual this.Multiselect to have the function ...
        // Lets take care of that another time ...
        var updatedMultiselect = Object.create(this.Multiselect);
        updatedMultiselect = Object.assign(
            updatedMultiselect,
            duplicatSelectFunctions
        );
        var updatedSingleselect = Object.create(this.Singleselect);
        updatedSingleselect = Object.assign(
            updatedSingleselect,
            duplicatSelectFunctions
        );
        
        // Create instances of the select menus
        for (var i=0; i < facet_fields.length; i++){
            if ("multiple" == facet_fields[i]['select']){
                this.selects[facet_fields[i]['field']] = Object.create(updatedMultiselect);
            } else {
                this.selects[facet_fields[i]['field']] = Object.create(updatedSingleselect);
            }
        }
        
        var facet_trail_array = $.map(facet_trail, function(entry) {
            var filters_array = [];
            var field_name = entry.field.replace(/!$/, '');
            if (entry.value.indexOf(" OR ") > -1) {
                $.each(entry.value.split(/\sOR\s/g), function(index, value) {
                    filters_array.push({
                        "field": field_name,
                        "key": entry.field,
                        "value": value
                    });
                });
            } else {
                filters_array.push({
                    "field": field_name,
                    "key": entry.field,
                    "value": entry.value
                });
            }
            return filters_array;
        });
        
        
        // Fill the existing filters object which will be used
        // to put the existing filters in each instance
        $.each(facet_trail_array, function(index, entry) {
            if (_this.selects.hasOwnProperty(entry.field)){
                if (existing_filters.hasOwnProperty(entry.field)) {
                    existing_filters[entry.field].push(entry);
                } else {
                    existing_filters[entry.field] = [entry];
                }
            } 
        });
        
        // Setup the mulitselect objects with the data
        for (var field_name in this.selects){
            var field_label = null;
            if (facet_labels
            && (field_name in facet_labels)
            && ("label" in facet_labels[field_name])){
                field_label = facet_labels[field_name]["label"];
            }
            
            if (existing_filters.hasOwnProperty(field_name)){
                this.selects[field_name].setup(
                        field_name,
                        existing_filters[field_name],
                        field_label
                );
            } else {
                this.selects[field_name].setup(
                        field_name,
                        [],
                        field_label
                );
            }
        }

        // Checking the checkboxes and changing the lable shown
        // Data will be retrieved later in the Multiselect class
        $('ul.multiple-checkbox').on('click change', function(event) {
            var $ul = $(event.delegateTarget);
            var data_name = $ul.parent().attr("data-name");
            
            var $target = $(event.target).closest('li');
            if ($target.hasClass('multiple-checkbox-item')) {
                var num_items = $ul.find('.multiple-checkbox-item').length;
                var num_checked = $ul.find('.multiple-checkbox-item input:checked').length;
                if (num_checked < num_items) {
                    $ul.children('.multiple-checkbox-all')
                    .removeClass('checked')
                    .find('input').prop('checked', false);
                }
            }
            
            if ($target.find('input').is(':checked')) {
                $target.addClass('checked');
            } else {
                $target.removeClass('checked');
            }
            
            _this.selects[data_name].label_updater.scheduleUpdate();
        });
        
        $('.multiple-checkbox-all input').on('click change', function() {
            var data_name = $(this).closest('fieldset.loc-dropdown').attr("data-name");
            
            if($(this).is(':checked')) {
                $(this).parents('.multiple-checkbox').children('.multiple-checkbox-item')
                .addClass('checked')
                .find('input').prop('checked', true);
            } else {
                $(this).parents('.multiple-checkbox').children('.multiple-checkbox-item')
                .removeClass('checked')
                .find('input')
                .removeAttr('checked')
                .prop('checked', false);
            }
            
            _this.selects[data_name].label_updater.scheduleUpdate();
        });
        
        $(document).keypress(function(event){
            // Press a key when the multiselect menu is open to auto scroll
            // to the first time that letter is at the beginning of the input
            // So if the county menu is open and you press the 'b' key the 
            // menu will automatically scroll to 'Baltimore' (If that was the
            // first occurrence of a b)
            var keyPressed = String.fromCharCode(event.which).toLowerCase();
            for (var data_type in _this.selects){
                // Only take into account the multiselect menus
                // Single selects already do it by default
                if ("single" == _this.selects[data_type].type){
                    continue;
                }
                if (_this.selects[data_type].isActive()){
                    _this.selects[data_type].setScrollTop(keyPressed);
                }
            }
        });
    },
    
    processMultiselectValues: function(form_data){
        for (var field_name in this.selects){
            if ("multiple" == this.selects[field_name]['type']){
                this.selects[field_name].processValues(form_data[field_name]);
            }
        }
    }
};

