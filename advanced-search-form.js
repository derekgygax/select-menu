{% load filters %}
"use strict";

jQuery(function($) {
    
    // Initiate the JS dealing with the multiselect menus
    var select_menus = Object.create(SelectMenus);
    select_menus.setup(
        {{ facet_trail|dumps|safe }},
        {{ search.site.form_facets|dumps }},
        {{ options.include_facets|listdicts_to_dict:"field"|dumps }}
     );

    /*
     Populating form facet menus,
     dealing with select-all-but... queries,
     form submission
    */

    var form_facets_list = [];
    {# jshint ignore:start #}
    {% if search.site.form_facets %}
    form_facets_list = {{ search.site.form_facets|dumps }};
    {% endif %}
    {# jshint ignore:end #}

    var IS_MULTISELECT = {};
    $.each(form_facets_list, function() {
        if (this.select === "multiple") {
            IS_MULTISELECT[this.field] = true;
        } else {
            IS_MULTISELECT[this.field] = false;
        }
    });


    function objectize(keyValueArray, keyString, valueString) {
        /*
         Takes an array of key-value entries where the key is found under the
         entry[keyString] property and the value is found under the
         entry[valueString] property, and combines them into one object,
         where keys can hold multiple values in an array.
         */
        var out_object = {};
        $.each(keyValueArray, function(index, keyValueEntry) {
            if (!keyValueEntry[valueString]) {
                // no value set: ignore and continue the each loop
                return true;
            }
            if (out_object.hasOwnProperty(keyValueEntry[keyString])) {
                out_object[keyValueEntry[keyString]].push(keyValueEntry[valueString]);
            } else {
                out_object[keyValueEntry[keyString]] = [keyValueEntry[valueString]];
            }
        });
        return out_object;
    }

    function addScreenReaderAlert(type){
        var alertNodeClass = "adv-search-screen-reader-alert";
        var alertNodeText = null;
        
        // Remove any previous version of the screen reader alert node
        $(document.body).find("." + alertNodeClass).remove();
        
        // Define the alert text for the screen reader
        if ("loading" == type){
            alertNodeText = "Updating the advanced search menus";
        } else if ("finished" == type) {
            alertNodeText = "Finished updating the advanced search menus";
        } else if ("error"){
            alertNodeText = "Search menus failed to load";
        }
        
        // Build the node that will trigger the screen reader
        var screenReaderAlertNode = document.createElement("p");
        screenReaderAlertNode.classList.add(alertNodeClass);
        screenReaderAlertNode.classList.add('screen-readers-only');
        screenReaderAlertNode.setAttribute("role", "alert");
        screenReaderAlertNode.appendChild(
            document.createTextNode(alertNodeText)
        );
        
        // Add the node to the body of the document
        $(document.body).append(screenReaderAlertNode);
        
        // If adding a finished alert then remove it after 3 seconds
        if ("finished" == type || "error" == type){
            setTimeout(function(){
                $(screenReaderAlertNode).remove();
            }, 5000);
        }
    }

    $("select[id$='-search']").change(function() {
        var $this = $(this);
        var values;
        if ($this.val()) {
            values = [$this.val()];
        } else {
            values = [];
        }
        // we want the multiple-checkbox menu to fire on the same trigger as
        // the select menus, but we can't use the `change` trigger because that
        // fires every time a single checkbox is changed -- so we trigger the
        // custom "selectionsChanged" event.  The listener for this event is
        // defined in the next section below.
        $this.trigger("selectionsChanged", {
            "selected": values,
            "multi": false
        });
    });

    $("select[id$='-search'], fieldset.multiple-checkbox-wrapper.loc-dropdown")
        .on("selectionsChanged", function(event, eventData) {
            var $this = $(this);
            // attributes for checkboxes || attributes for select:
            var this_field_name = $this.attr("data-name") || $this.attr("name");
            
            // apply the newly selected filters to this field:
            var selected_values = eventData.selected.filter(function(entry) {
                return entry !== "Select All";
            });

            // Change the current filters for the select menu
            select_menus.selects[this_field_name].change_current_filters(selected_values);
            
            // If the field is language return before anything is done
            if (this_field_name == "language"){
                return;
            }
            // Identify the fields to be updated
            // We don't really need the booleans -- just the keys:
            var update_menus = {};
            var update_facet = false;
            $.each(Object.keys(IS_MULTISELECT), function(){
                if (update_facet){
                    update_menus[this] = true;
                    // Change the current filters for the select menu
                    delete select_menus.selects[this].current_filters;
                } else {
                    if (this === this_field_name){
                        update_facet = true;
                    }
                    return true;
                }
            });

            // current_filters is the current "saved" state of the form, but post_filters
            // is what will be used when making an ajax post.
            var post_filters = {};
            for (var field_name in select_menus.selects){
                var select_menu = select_menus.selects[field_name];
                if (select_menu.hasOwnProperty("current_filters")){
                    post_filters[field_name] = select_menu.getCurrentFiltersAsArray();
                }
            }

            // invert the selection of post_filters for multiselect menus, if necessary:
            if (selected_values.length) {
                $.each(IS_MULTISELECT, function(field_name, is_multi) {
                    if (!post_filters[field_name]) {
                        // no filter currently applied for the given field: continue
                        return true;
                    }
                    if (is_multi) {

                        var filter_details_array = select_menus.selects[field_name].get_inverted_params(
                            post_filters[field_name],
                            true
                        );
                        delete post_filters[field_name];
                        var filter_details_object = objectize(filter_details_array, "key", "value");
                        for (var key in filter_details_object) {
                            post_filters[key] = filter_details_object[key];
                        }
                    }
                });
            }

            // as we fire off an ajax request, display the loading gif
            // while we wait for the response:
            $.each(update_menus, function(field_name) {
                select_menus.selects[field_name].markAsLoading();
            });
            addScreenReaderAlert("loading");
            
            var search_url = "{{ search.url|safe }}";
            search_url = search_url.replace(/fa=[^&]+&?/g, '');

            var post_url = search_url + (
                search_url.indexOf('?') > -1 ? '&' : '?'
            ) + "fo=json&at=form_facets,options";
            if (post_url.indexOf("searchType=advanced") === -1) {
                post_url += "&searchType=advanced";
            }
            $.ajax({
                // traditional data serialization is necessary so that array-valued
                // items in the post data are serialized in ajax calls using the same
                // keys used when a POST is issued from the form, instead of the new
                // `<key_name>[]` format (they append square brackets to the key name
                // to indicate that it is array-valued. it's the new jQuery way since
                // version 1.4).
                traditional: true,
                type: "POST",
                url: post_url,
                data: post_filters,
                dataType: "json",
                success: function(response) {
                    $.each(update_menus, function(field_name) {
                        var facet_filters = response.form_facets[field_name];
                        if (!facet_filters){
                            facet_filters = [];
                        }
                        // Remove the selects that are currently in the menu
                        select_menus.selects[field_name].removeSelectsFromMenu();
                        // If looking at a multiselect unselect Select All and
                        // if the required field isn't selected don't populate and
                        // empty the data 'selected' in the fieldset object
                        if ("multiple" == select_menus.selects[field_name].type){
                            select_menus.selects[field_name].emptyFieldSetData();
                            select_menus.selects[field_name].uncheckMenuChildren();
                            //this corresponds to below
                            var required = $('.advanced-search-select.required select');
                            if (required.length && !$(required).val()) {
                                // no location_country is set: don't update checkbox menus
                                select_menus.selects[field_name].removeLoadingMarker();
                                select_menus.selects[field_name].resetButtonDisplay();
                                return true;
                            }                                
                        }
                        // Add the new filters the menus
                        select_menus.selects[field_name].addToMenu(facet_filters);
                        
                        select_menus.selects[field_name].finishedAjax();
                    // end of each(menu)
                    });
                    // Remove that alert that you are loading and add
                    // an alert that you are finished loading
                    addScreenReaderAlert("finished");
            // end of ajax success function
                },
                error: function(){
                    // Remove the alert that you are loading and add
                    // an alert that the select menu loading has failed
                    addScreenReaderAlert("error");                    
                }
            });
        // end of on('selectionChange') event
        });


    // on submit, invert the facet queries if needed:
    $("#advanced-search-form").submit(function() {
        // retain only the keywords and ops that are not hidden.
        // on the back-end we'll filter out the blank keywords.
        $(this).find("div.advanced-keyword-search:hidden").remove();

        var form_data_array = $(this).serializeArray();
        var form_data_object = objectize(form_data_array, "name", "value");
        select_menus.processMultiselectValues(form_data_object);
        // submit the form:
        return true;
    });

    // Establish session storage object for saving and populating fields
    var advanced_search_form_object = Object.create(AdvancedSearchFormObj);
    advanced_search_form_object.setup();
    advanced_search_form_object.retrieveQsOpsFromSession();
    advanced_search_form_object.populateQsOpsFields();

    $(".advanced-search-toggle a.unchecked").click(function(event) {
        event.preventDefault();
        advanced_search_form_object.saveQsOps("display-level");
        advanced_search_form_object.storeInSession();
        window.location = $(event.delegateTarget).attr("href");
    });

    $(".advanced-search-wrapper > h2").click(function(event){
        $('.icon', event.delegateTarget)
            .andSelf()
            .toggleClass('accordion-down accordion-up');
        $('#adv-search-div').toggle();

        var form_vis_status = $('#adv-search-div').is(":visible");
        $('#adv-search-div').attr('aria-hidden', !form_vis_status);
        $('#adv-search-button').attr('aria-expanded', form_vis_status);

        if ($('.advanced-search-wrapper h2 a > i.icon').hasClass('accordion-down')) {
            $('.advanced-search-wrapper h2 a > i.icon').addClass('icon-minus-square');
        } else {
            $('.advanced-search-wrapper h2 a > i.icon').removeClass('icon-minus-square');
        }
        return false;
    });

    var saved_queries = $('.advanced-query').map(function() {
        return $(this).val() || null;
    });

    // open the advanced search form if we are in advanced search mode or if
    // the advanced search form has any values saved in it:
    var in_advanced_mode = "{{ options.searchType }}" === "advanced";
    if (in_advanced_mode
    || saved_queries.length > 0
    || $("select[id$='-search']").val()
    || $("input[id$='-date']").val()
    || $("#front-pages-only").is(":checked")) {
        $('#adv-search-button').click();
    }

    $('.x-button').on('click', function() {
        $('#max-limit').hide();
        var $parent = $(this).parent('.custom-select-menu');
        $parent.slideUp("slow");
    });

});


