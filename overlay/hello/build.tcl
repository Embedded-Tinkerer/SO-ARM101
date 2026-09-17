# build.tcl - Scripted Vivado overlay build for PYNQ-Z2
set proj_name "hello_overlay"
set proj_dir  "./build"
set part_num  "xc7z020clg400-1"

# 1. Initialize project
create_project $proj_name $proj_dir -part $part_num -force

# 2. Add RTL sources
add_files -norecurse "../../rtl/axi_counter.v"
update_compile_order -fileset sources_1

# 3. Create Block Design
create_bd_design "hello_design"

# Instantiate Zynq PS
set ps7 [create_bd_cell -type ip -vlnv xilinx.com:ip:processing_system7:5.5 ps7]
# Apply standard Zynq defaults (M_AXI_GP0 enabled, FCLK_CLK0 @ 100MHz)
apply_bd_automation -rule xilinx.com:bd_rule:processing_system7 -config {make_external "FIXED_IO, DDR" apply_board_preset "0" Master "Disable" Slave "Disable"} $ps7

# Instantiate AXI GPIO for onboard LEDs
set axi_gpio [create_bd_cell -type ip -vlnv xilinx.com:ip:axi_gpio:2.0 axi_gpio_leds]
set_property -dict [list CONFIG.C_GPIO_WIDTH {4} CONFIG.C_ALL_OUTPUTS {1}] $axi_gpio

# Instantiate Custom RTL Counter Module
set counter_inst [create_bd_cell -type module -reference axi_counter counter_0]

# Auto-connect AXI Interconnect and Peripherals
apply_bd_automation -rule xilinx.com:bd_rule:axi4 -config {Master "/ps7/M_AXI_GP0" Clk "Auto"} [get_bd_intf_pins axi_gpio_leds/S_AXI]
apply_bd_automation -rule xilinx.com:bd_rule:axi4 -config {Master "/ps7/M_AXI_GP0" Clk "Auto"} [get_bd_intf_pins counter_0/s_axi]

# Make GPIO external pins for LED mapping
create_bd_port -dir O -from 3 -to 0 leds_4bits
connect_bd_net [get_bd_pins axi_gpio_leds/gpio_io_o] [get_bd_ports leds_4bits]

# 4. Create Top-level Wrapper & Constraints
make_wrapper -files [get_files [get_property FILE_NAME [current_bd_design]]] -top
add_files -norecurse "$proj_dir/$proj_name.srcs/sources_1/bd/hello_design/hdl/hello_design_wrapper.v"
update_compile_order -fileset sources_1

# Add Pin Constraints for LEDs
set xdc_file "$proj_dir/pins.xdc"
set fp [open $xdc_file w]
puts $fp "set_property -dict { PACKAGE_PIN R14   IOSTANDARD LVCMOS33 } \[get_ports { leds_4bits\[0\] }\];"
puts $fp "set_property -dict { PACKAGE_PIN P14   IOSTANDARD LVCMOS33 } \[get_ports { leds_4bits\[1\] }\];"
puts $fp "set_property -dict { PACKAGE_PIN N16   IOSTANDARD LVCMOS33 } \[get_ports { leds_4bits\[2\] }\];"
puts $fp "set_property -dict { PACKAGE_PIN M14   IOSTANDARD LVCMOS33 } \[get_ports { leds_4bits\[3\] }\];"
close $fp
add_files -fileset constrs_1 -norecurse $xdc_file

# 5. Synthesis, Implementation, and Bitstream Generation
launch_runs impl_1 -to_step write_bitstream -jobs 8
wait_on_run impl_1

# 6. Export .bit and .hwh for PYNQ
file mkdir "./out"
file copy -force "$proj_dir/$proj_name.runs/impl_1/hello_design_wrapper.bit" "./out/hello.bit"
file copy -force "$proj_dir/$proj_name.gen/sources_1/bd/hello_design/hw_handoff/hello_design.hwh" "./out/hello.hwh"

puts "Build Complete! Exported out/hello.bit and out/hello.hwh"
exit