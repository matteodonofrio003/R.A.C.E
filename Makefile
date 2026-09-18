PROJECTS := ECU1_Cockpit ECU2_Powertrain

.PHONY: all clean $(PROJECTS)

all: $(PROJECTS)

$(PROJECTS):
	$(MAKE) -C $@

clean:
	$(foreach project,$(PROJECTS),$(MAKE) -C $(project) clean;)
