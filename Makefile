PROJECTS := race_project

.PHONY: all clean $(PROJECTS)

all: $(PROJECTS)

$(PROJECTS):
	$(MAKE) -C $@

clean:
	$(foreach project,$(PROJECTS),$(MAKE) -C $(project) clean;)
